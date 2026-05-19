import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const OFFLINE_QUEUE_KEY = '@unicontrol_offline_queue';
const CACHE_PREFIX = '@unicontrol_cache_';
const ID_MAP_KEY = '@unicontrol_id_map';

async function getIdMap() {
  try {
    const mapJson = await AsyncStorage.getItem(ID_MAP_KEY);
    return mapJson ? JSON.parse(mapJson) : {};
  } catch (e) {
    return {};
  }
}

async function saveIdMap(map) {
  try {
    await AsyncStorage.setItem(ID_MAP_KEY, JSON.stringify(map));
  } catch (e) {}
}

// Verificar el estado de la conexión a internet
export async function isConnected() {
  const state = await NetInfo.fetch();
  // Se utiliza state.isConnected ya que isInternetReachable puede ser null o false en emuladores o entornos de desarrollo local (localhost)
  return state.isConnected === true;
}

// Helper para crear una respuesta simulada compatible con el contrato de Response
function createMockResponse(bodyText, status = 200, isOk = true) {
  return {
    ok: isOk,
    status: status,
    json: async () => JSON.parse(bodyText),
    text: async () => bodyText,
    clone: () => createMockResponse(bodyText, status, isOk)
  };
}

// Calcular el total de un pedido offline basándose en caché y cola local
async function calculateOfflineOrderTotal(orderId) {
  let total = 0;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const targetSuffix = `/api/orders/${orderId}/items`;
    const orderItemsKey = keys.find(k => k.startsWith(CACHE_PREFIX) && k.endsWith(targetSuffix));
    if (orderItemsKey) {
      const cachedData = await AsyncStorage.getItem(orderItemsKey);
      if (cachedData !== null) {
        const items = JSON.parse(cachedData);
        if (Array.isArray(items)) {
          items.forEach(item => {
            total += parseInt(item.quantity || 0) * parseFloat(item.price || 0);
          });
        }
      }
    }
    
    const queue = await getOfflineQueue();
    const cachedProducts = await getCachedProducts();
    for (const r of queue) {
      const rPath = getCleanPath(r.url);
      if (rPath === `/api/orders/${orderId}/items` && r.method.toUpperCase() === 'POST' && r.body) {
        try {
          const rBody = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
          if (rBody) {
            const product = cachedProducts.find(p => String(p.id) === String(rBody.product_id));
            const price = product ? parseFloat(product.price) : 0;
            total += price * parseInt(rBody.quantity || 1);
          }
        } catch (e) {}
      }
    }
  } catch (e) {
    console.error('[OfflineSync] Error calculando total del pedido offline:', e);
  }
  return total;
}

// Función central para hacer peticiones (Reemplazo de fetch nativo)
export async function apiFetch(url, options = {}) {
  const method = options.method || 'GET';
  const online = await isConnected();

  // 1. Manejo de peticiones de lectura (GET)
  if (method === 'GET') {
    const cacheKey = `${CACHE_PREFIX}${url}`;
    const cleanGetPath = getCleanPath(url);
    if (online) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          // Guardar en caché local para uso offline
          const clone = response.clone();
          const text = await clone.text();
          await AsyncStorage.setItem(cacheKey, text);
          
          // Aplicar operaciones encoladas en caliente sobre el resultado fresco
          let parsedData = JSON.parse(text);
          parsedData = await applyOfflineQueueToData(url, parsedData);
          return createMockResponse(JSON.stringify(parsedData), response.status, response.ok);
        }
        return response;
      } catch (err) {
        console.warn(`[OfflineSync] Fallo de red para GET ${url}, usando caché local...`, err);
        const cachedData = await AsyncStorage.getItem(cacheKey);
        let parsedData = cleanGetPath.includes('/dashboard') ? {} : [];
        if (cachedData !== null) {
          try {
            parsedData = JSON.parse(cachedData);
          } catch (e) {
            parsedData = cleanGetPath.includes('/dashboard') ? {} : [];
          }
        }
        parsedData = await applyOfflineQueueToData(url, parsedData);
        return createMockResponse(JSON.stringify(parsedData), 200, true);
      }
    } else {
      console.log(`[OfflineSync] Dispositivo offline. Cargando caché para GET ${url}`);
      const cachedData = await AsyncStorage.getItem(cacheKey);
      let parsedData = cleanGetPath.includes('/dashboard') ? {} : [];
      if (cachedData !== null) {
        try {
          parsedData = JSON.parse(cachedData);
        } catch (e) {
          parsedData = cleanGetPath.includes('/dashboard') ? {} : [];
        }
      }
      parsedData = await applyOfflineQueueToData(url, parsedData);
      return createMockResponse(JSON.stringify(parsedData), 200, true);
    }
  }

  // 2. Manejo de peticiones de escritura (POST, PUT, DELETE)
  if (online) {
    try {
      const response = await fetch(url, options);
      // Si el servidor está caído (ej. responde 502/503/504) o da error de red, encolamos
      if (!response.ok && response.status >= 502) {
        throw new Error('Servidor inalcanzable');
      }
      return response;
    } catch (err) {
      console.warn(`[OfflineSync] Error al enviar ${method} ${url}. Encolando petición...`);
      const reqId = await enqueueRequest(url, options);
      
      let extraData = {};
      const cleanPath = getCleanPath(url);
      if (cleanPath.startsWith('/api/orders/') && cleanPath.endsWith('/checkout') && method === 'POST') {
        const orderId = cleanPath.split('/')[3];
        const total = await calculateOfflineOrderTotal(orderId);
        extraData = { total };
      }
      
      return createMockResponse(JSON.stringify({ 
        id: reqId ? `temp_${reqId}` : undefined, 
        success: true, 
        offline: true, 
        message: 'Guardado localmente. Se sincronizará al recuperar internet.',
        ...extraData
      }), 200, true);
    }
  } else {
    console.log(`[OfflineSync] Dispositivo offline. Encolando petición ${method} ${url}`);
    const reqId = await enqueueRequest(url, options);
    
    let extraData = {};
    const cleanPath = getCleanPath(url);
    if (cleanPath.startsWith('/api/orders/') && cleanPath.endsWith('/checkout') && method === 'POST') {
      const orderId = cleanPath.split('/')[3];
      const total = await calculateOfflineOrderTotal(orderId);
      extraData = { total };
    }
    
    return createMockResponse(JSON.stringify({ 
      id: reqId ? `temp_${reqId}` : undefined, 
      success: true, 
      offline: true, 
      message: 'Guardado localmente. Se sincronizará al recuperar internet.',
      ...extraData
    }), 200, true);
  }
}

// Helper para limpiar urls y obtener una ruta de API canónica para comparaciones
function getCleanPath(urlStr) {
  try {
    let path = urlStr.split('?')[0];
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    const apiIndex = path.indexOf('/api/');
    if (apiIndex !== -1) {
      return path.substring(apiIndex).toLowerCase();
    }
    return path.toLowerCase();
  } catch (e) {
    return urlStr.toLowerCase();
  }
}

// Calcula dinámicamente el totalDebt de un deudor a partir de su caché de transacciones y la cola offline
async function calculateOfflineTotalDebt(debtorId, baseTotalDebt) {
  const cacheKey = `${CACHE_PREFIX}/api/debtors/${debtorId}/debts`;
  const cachedData = await AsyncStorage.getItem(cacheKey);
  
  if (cachedData === null && !debtorId.startsWith('temp_')) {
    // Si no hay caché y no es un deudor temporal, devolvemos el saldo base + los POST pendientes
    const queue = await getOfflineQueue();
    let additionalDebt = 0;
    for (const req of queue) {
      const cleanReqPath = getCleanPath(req.url);
      const method = req.method.toUpperCase();
      if (cleanReqPath === `/api/debtors/${debtorId}/debts` && method === 'POST') {
        let reqBody = null;
        if (req.body) {
          try {
            reqBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
          } catch (e) {}
        }
        if (reqBody) {
          const amount = parseFloat(reqBody.amount || 0) * parseInt(reqBody.quantity || 1);
          if (reqBody.type === 'debt') {
            additionalDebt += amount;
          } else if (reqBody.type === 'payment') {
            additionalDebt -= amount;
          }
        }
      }
    }
    return baseTotalDebt + additionalDebt;
  }
  
  // Si hay caché o es temporal, calculamos el saldo sumando todas las transacciones locales mezcladas
  let transactions = [];
  if (cachedData !== null) {
    try {
      transactions = JSON.parse(cachedData);
    } catch (e) {}
  }
  
  transactions = await applyOfflineQueueToData(`/api/debtors/${debtorId}/debts`, transactions);
  
  return transactions.reduce((sum, tx) => {
    const amt = parseFloat(tx.amount || 0) * parseInt(tx.quantity || 1);
    return tx.type === 'debt' ? sum + amt : sum - amt;
  }, 0);
}

// Helper para obtener productos desde la caché de AsyncStorage
async function getCachedProducts() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const productKey = keys.find(k => k.startsWith(CACHE_PREFIX) && k.endsWith('/api/products'));
    if (productKey) {
      const dataJson = await AsyncStorage.getItem(productKey);
      if (dataJson) {
        const parsed = JSON.parse(dataJson);
        return Array.isArray(parsed) ? parsed : [];
      }
    }
  } catch (e) {}
  return [];
}

// Mezcla los datos locales en cola sobre las respuestas GET en caché o frescas
async function applyOfflineQueueToData(getUrl, data) {
  try {
    const queue = await getOfflineQueue();
    if (queue.length === 0) return data;

    const cleanGetPath = getCleanPath(getUrl);
    
    for (const req of queue) {
      const cleanReqPath = getCleanPath(req.url);
      const method = req.method.toUpperCase();
      
      let reqBody = null;
      if (req.body) {
        try {
          reqBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } catch (e) {
          reqBody = null;
        }
      }
      
      // PRODUCTOS
      if (cleanGetPath === '/api/products') {
        if (Array.isArray(data)) {
          if (cleanReqPath === '/api/products' && method === 'POST' && reqBody) {
            const exists = data.some(p => p.id === `temp_${req.id}` || p.name === reqBody.name);
            if (!exists) {
              data.push({
                id: `temp_${req.id}`,
                name: reqBody.name,
                description: reqBody.description || '',
                price: parseFloat(reqBody.price || 0),
                stock: parseInt(reqBody.stock || 0),
                cost_price: parseFloat(reqBody.cost_price || 0),
                profit_margin: parseFloat(reqBody.profit_margin || 0),
                code: reqBody.code || null,
                min_stock: parseInt(reqBody.min_stock !== undefined ? reqBody.min_stock : 5),
                total_batches: parseInt(reqBody.stock || 0) > 0 ? 1 : 0,
                available_batches: parseInt(reqBody.stock || 0) > 0 ? 1 : 0,
                created_at: req.timestamp || new Date().toISOString()
              });
            }
          } else if (method === 'PUT' && reqBody && cleanReqPath.startsWith('/api/products/')) {
            const productId = cleanReqPath.split('/').pop();
            const idx = data.findIndex(p => String(p.id) === productId);
            if (idx !== -1) {
              data[idx] = {
                ...data[idx],
                hasPendingChanges: true,
                name: reqBody.name !== undefined ? reqBody.name : data[idx].name,
                description: reqBody.description !== undefined ? reqBody.description : data[idx].description,
                price: reqBody.price !== undefined ? parseFloat(reqBody.price) : data[idx].price,
                stock: reqBody.stock !== undefined ? parseInt(reqBody.stock) : data[idx].stock,
                cost_price: reqBody.cost_price !== undefined ? parseFloat(reqBody.cost_price) : data[idx].cost_price,
                profit_margin: reqBody.profit_margin !== undefined ? parseFloat(reqBody.profit_margin) : data[idx].profit_margin,
                code: reqBody.code !== undefined ? reqBody.code : data[idx].code,
                min_stock: reqBody.min_stock !== undefined ? parseInt(reqBody.min_stock) : data[idx].min_stock,
              };
            }
          } else if (method === 'DELETE' && cleanReqPath.startsWith('/api/products/')) {
            const productId = cleanReqPath.split('/').pop();
            data = data.filter(p => String(p.id) !== productId);
          } else if (method === 'POST' && cleanReqPath.startsWith('/api/products/') && cleanReqPath.endsWith('/recharge') && reqBody) {
            const productId = cleanReqPath.split('/')[3];
            const idx = data.findIndex(p => String(p.id) === productId);
            if (idx !== -1) {
              data[idx].hasPendingChanges = true;
              const qty = parseInt(reqBody.quantity || 0);
              data[idx].stock = (data[idx].stock || 0) + qty;
              if (qty > 0) {
                data[idx].total_batches = (data[idx].total_batches || 0) + 1;
                data[idx].available_batches = (data[idx].available_batches || 0) + 1;
              }
              if (reqBody.price) data[idx].price = parseFloat(reqBody.price);
              if (reqBody.cost_price) data[idx].cost_price = parseFloat(reqBody.cost_price);
              if (reqBody.profit_margin) data[idx].profit_margin = parseFloat(reqBody.profit_margin);
            }
          } else if (cleanReqPath === '/api/sales' && method === 'POST' && reqBody && Array.isArray(reqBody.items)) {
            // Descontar stock de las ventas offline
            for (const item of reqBody.items) {
              const productId = item.product_id;
              const qty = parseInt(item.quantity || 0);
              const idx = data.findIndex(p => String(p.id) === String(productId));
              if (idx !== -1) {
                data[idx].stock = Math.max(0, (data[idx].stock || 0) - qty);
              }
            }
          } else if (cleanReqPath.startsWith('/api/orders/') && cleanReqPath.endsWith('/items') && method === 'POST' && reqBody) {
            // Descontar stock de items agregados a ordenes offline
            const productId = reqBody.product_id;
            const qty = parseInt(reqBody.quantity || 0);
            const idx = data.findIndex(p => String(p.id) === String(productId));
            if (idx !== -1) {
              data[idx].stock = Math.max(0, (data[idx].stock || 0) - qty);
            }
          } else if (cleanReqPath.startsWith('/api/orders/') && method === 'DELETE') {
            // Devolver stock al cancelar orden offline
            const orderId = cleanReqPath.split('/')[3];
            for (const r of queue) {
              const rPath = getCleanPath(r.url);
              if (rPath === `/api/orders/${orderId}/items` && r.method.toUpperCase() === 'POST' && r.body) {
                try {
                  const rBody = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
                  if (rBody) {
                    const productId = rBody.product_id;
                    const qty = parseInt(rBody.quantity || 0);
                    const idx = data.findIndex(p => String(p.id) === String(productId));
                    if (idx !== -1) {
                      data[idx].stock = (data[idx].stock || 0) + qty;
                    }
                  }
                } catch (e) {}
              }
            }
          }
        }
      }

      // LOTES DE PRODUCTOS
      if (cleanGetPath.startsWith('/api/products/') && cleanGetPath.endsWith('/batches')) {
        if (Array.isArray(data)) {
          const productId = cleanGetPath.split('/')[3];
          if (method === 'POST' && cleanReqPath === `/api/products/${productId}/recharge` && reqBody) {
            data.unshift({
              id: `temp_batch_${req.id}`,
              product_id: productId,
              initial_quantity: parseInt(reqBody.quantity || 0),
              quantity: parseInt(reqBody.quantity || 0),
              cost_price: parseFloat(reqBody.cost_price || 0),
              profit_margin: parseFloat(reqBody.profit_margin || 0),
              price: parseFloat(reqBody.price || 0),
              created_at: req.timestamp || new Date().toISOString()
            });
          }
        }
      }

      // DEUDORES / CLIENTES
      if (cleanGetPath === '/api/debtors') {
        if (Array.isArray(data)) {
          if (cleanReqPath === '/api/debtors' && method === 'POST' && reqBody) {
            const exists = data.some(d => d.id === `temp_${req.id}` || d.name === reqBody.name);
            if (!exists) {
              data.push({
                id: `temp_${req.id}`,
                name: reqBody.name,
                phone: reqBody.phone || '',
                email: reqBody.email || '',
                identification: reqBody.identification || '',
                address: reqBody.address || '',
                notes: reqBody.notes || '',
                totalDebt: 0,
                createdAt: req.timestamp || new Date().toISOString()
              });
            }
          } else if (method === 'PUT' && reqBody && cleanReqPath.startsWith('/api/debtors/')) {
            const debtorId = cleanReqPath.split('/').pop();
            const idx = data.findIndex(d => String(d.id) === debtorId);
            if (idx !== -1) {
              data[idx] = {
                ...data[idx],
                name: reqBody.name !== undefined ? reqBody.name : data[idx].name,
                phone: reqBody.phone !== undefined ? reqBody.phone : data[idx].phone,
                email: reqBody.email !== undefined ? reqBody.email : data[idx].email,
                identification: reqBody.identification !== undefined ? reqBody.identification : data[idx].identification,
                address: reqBody.address !== undefined ? reqBody.address : data[idx].address,
                notes: reqBody.notes !== undefined ? reqBody.notes : data[idx].notes,
              };
            }
          } else if (method === 'DELETE' && cleanReqPath.startsWith('/api/debtors/')) {
            const debtorId = cleanReqPath.split('/').pop();
            data = data.filter(d => String(d.id) !== debtorId);
          }
        }
      }

      // TRANSACCIONES DE DEUDORES (DEBTS)
      if (cleanGetPath.startsWith('/api/debtors/') && cleanGetPath.endsWith('/debts')) {
        if (Array.isArray(data)) {
          const debtorId = cleanGetPath.split('/')[3];
          if (method === 'POST' && cleanReqPath === `/api/debtors/${debtorId}/debts` && reqBody) {
            data.unshift({
              id: `temp_tx_${req.id}`,
              debtor_id: debtorId,
              amount: parseFloat(reqBody.amount || 0),
              quantity: parseInt(reqBody.quantity || 1),
              type: reqBody.type || 'debt',
              description: reqBody.description || '',
              date: new Date(req.timestamp || new Date()).toLocaleString()
            });
          } else if (method === 'PUT' && cleanReqPath.startsWith('/api/debts/') && reqBody) {
            const txId = cleanReqPath.split('/').pop();
            const idx = data.findIndex(tx => String(tx.id) === txId);
            if (idx !== -1) {
              data[idx] = {
                ...data[idx],
                amount: reqBody.amount !== undefined ? parseFloat(reqBody.amount) : data[idx].amount,
                quantity: reqBody.quantity !== undefined ? parseInt(reqBody.quantity) : data[idx].quantity,
                type: reqBody.type !== undefined ? reqBody.type : data[idx].type,
                description: reqBody.description !== undefined ? reqBody.description : data[idx].description,
              };
            }
          } else if (method === 'DELETE' && cleanReqPath.startsWith('/api/debts/')) {
            const txId = cleanReqPath.split('/').pop();
            data = data.filter(tx => String(tx.id) !== txId);
          }
        }
      }

      // VENTAS
      if (cleanGetPath === '/api/sales') {
        if (Array.isArray(data)) {
          // 1. Agregar ventas directas offline (POST /api/sales)
          if (cleanReqPath === '/api/sales' && method === 'POST' && reqBody) {
            const exists = data.some(s => s.id === `temp_${req.id}`);
            if (!exists) {
              let total = 0;
              if (Array.isArray(reqBody.items)) {
                total = reqBody.items.reduce((sum, item) => sum + (parseFloat(item.price) * parseInt(item.quantity)), 0);
              }
              data.unshift({
                id: `temp_${req.id}`,
                debtor_id: reqBody.debtor_id || null,
                payment_type: reqBody.payment_type || 'cash',
                total: total,
                created_at: req.timestamp || new Date().toISOString()
              });
            }
          }
          // 2. Agregar ventas provenientes de checkout de ordenes (POST /api/orders/:orderId/checkout)
          else if (cleanReqPath.startsWith('/api/orders/') && cleanReqPath.endsWith('/checkout') && method === 'POST') {
            const reqOrderId = cleanReqPath.split('/')[3];
            const exists = data.some(s => String(s.order_id) === String(reqOrderId) || s.id === `temp_${req.id}`);
            if (!exists) {
              let total = 0;
              const debtorId = reqBody ? reqBody.debtor_id : null;
              
              // Buscar todos los items que se agregaron a este pedido en la cola
              const cachedProducts = await getCachedProducts();
              for (const r of queue) {
                const rPath = getCleanPath(r.url);
                if (rPath === `/api/orders/${reqOrderId}/items` && r.method.toUpperCase() === 'POST' && r.body) {
                  try {
                    const rBody = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
                    if (rBody) {
                      const product = cachedProducts.find(p => String(p.id) === String(rBody.product_id));
                      const price = product ? parseFloat(product.price) : 0;
                      total += price * parseInt(rBody.quantity || 1);
                    }
                  } catch (e) {}
                }
              }
              
              data.unshift({
                id: `temp_${req.id}`,
                order_id: reqOrderId,
                order_reference: `Pedido #${reqOrderId}`,
                debtor_id: debtorId,
                payment_type: debtorId ? 'debt' : 'cash',
                total: total,
                created_at: req.timestamp || new Date().toISOString()
              });
            }
          }
          else if (method === 'DELETE' && cleanReqPath.startsWith('/api/sales/')) {
            const saleId = cleanReqPath.split('/').pop();
            data = data.filter(s => String(s.id) !== saleId);
          }
        }
      }

      // ARTÍCULOS DE LA VENTA
      if (cleanGetPath.startsWith('/api/sales/') && cleanGetPath.endsWith('/items')) {
        if (Array.isArray(data)) {
          const saleId = cleanGetPath.split('/')[3];
          if (saleId.startsWith('temp_')) {
            const checkoutReq = queue.find(r => `temp_${r.id}` === saleId);
            if (checkoutReq) {
              const rPath = getCleanPath(checkoutReq.url);
              if (rPath === '/api/sales') {
                const rBody = typeof checkoutReq.body === 'string' ? JSON.parse(checkoutReq.body) : checkoutReq.body;
                if (rBody && Array.isArray(rBody.items)) {
                  data = rBody.items.map((item, index) => ({
                    id: `temp_sale_item_${index}_${checkoutReq.id}`,
                    product_id: item.product_id,
                    quantity: parseInt(item.quantity),
                    price: parseFloat(item.price),
                    product_name: item.product_name || `Producto #${item.product_id}`
                  }));
                }
              } else if (rPath.startsWith('/api/orders/') && rPath.endsWith('/checkout')) {
                const orderId = rPath.split('/')[3];
                const cachedProducts = await getCachedProducts();
                const itemsList = [];
                for (const r of queue) {
                  const rPath2 = getCleanPath(r.url);
                  if (rPath2 === `/api/orders/${orderId}/items` && r.method.toUpperCase() === 'POST' && r.body) {
                    try {
                      const rBody = typeof r.body === 'string' ? JSON.parse(r.body) : r.body;
                      if (rBody) {
                        const product = cachedProducts.find(p => String(p.id) === String(rBody.product_id));
                        const price = product ? parseFloat(product.price) : 0;
                        const qty = parseInt(rBody.quantity || 1);
                        itemsList.push({
                          id: `temp_sale_item_${r.id}`,
                          product_id: rBody.product_id,
                          quantity: qty,
                          price: price,
                          product_name: product ? product.name : `Producto #${rBody.product_id}`
                        });
                      }
                    } catch (e) {}
                  }
                }
                data = itemsList;
              }
            }
          }
        }
      }

      // PEDIDOS / MESAS (ORDERS)
      if (cleanGetPath === '/api/orders') {
        if (Array.isArray(data)) {
          if (cleanReqPath === '/api/orders' && method === 'POST' && reqBody) {
            const exists = data.some(o => o.id === `temp_${req.id}`);
            if (!exists) {
              data.unshift({
                id: `temp_${req.id}`,
                reference: reqBody.reference,
                status: 'pending',
                created_at: req.timestamp || new Date().toISOString()
              });
            }
          } else if (method === 'DELETE' && cleanReqPath.startsWith('/api/orders/')) {
            const parts = cleanReqPath.split('/');
            if (parts.length === 4 && parts[2] === 'orders') {
              const reqOrderId = parts[3];
              data = data.filter(o => String(o.id) !== String(reqOrderId));
            }
          } else if (method === 'POST' && cleanReqPath.startsWith('/api/orders/') && cleanReqPath.endsWith('/checkout')) {
            const reqOrderId = cleanReqPath.split('/')[3];
            data = data.filter(o => String(o.id) !== String(reqOrderId));
          }
        }
      }

      // ARTÍCULOS DE UN PEDIDO (ORDER ITEMS)
      if (cleanGetPath.startsWith('/api/orders/') && cleanGetPath.endsWith('/items')) {
        if (Array.isArray(data)) {
          const getOrderId = cleanGetPath.split('/')[3];
          
          if (method === 'POST' && cleanReqPath === `/api/orders/${getOrderId}/items` && reqBody) {
            const cachedProducts = await getCachedProducts();
            const product = cachedProducts.find(p => String(p.id) === String(reqBody.product_id));
            const price = product ? parseFloat(product.price) : 0;
            const qty = parseInt(reqBody.quantity || 1);
            
            const existingIdx = data.findIndex(item => String(item.product_id) === String(reqBody.product_id) && parseFloat(item.price) === price);
            
            if (existingIdx !== -1) {
              data[existingIdx].quantity += qty;
              data[existingIdx].subtotal = data[existingIdx].quantity * price;
            } else {
              data.push({
                id: `temp_order_item_${req.id}`,
                order_id: getOrderId,
                product_id: reqBody.product_id,
                quantity: qty,
                price: price,
                subtotal: qty * price,
                name: product ? product.name : `Producto #${reqBody.product_id}`,
                code: product ? product.code : '',
                stock: product ? product.stock : 999
              });
            }
          } else if (cleanReqPath.startsWith(`/api/orders/${getOrderId}/items/`)) {
            const itemId = cleanReqPath.split('/').pop();
            if (method === 'PUT' && reqBody) {
              const qty = parseInt(reqBody.quantity);
              if (qty <= 0) {
                data = data.filter(item => String(item.id) !== String(itemId));
              } else {
                const idx = data.findIndex(item => String(item.id) === String(itemId));
                if (idx !== -1) {
                  data[idx].quantity = qty;
                  data[idx].subtotal = qty * parseFloat(data[idx].price);
                }
              }
            } else if (method === 'DELETE') {
              data = data.filter(item => String(item.id) !== String(itemId));
            }
          }
        }
      }
    }

    // Recalcular saldos totales dinámicamente si estamos listando deudores y hay cambios en transacciones
    if (cleanGetPath === '/api/debtors' && Array.isArray(data)) {
      const hasTxModifications = queue.some(req => {
        const p = getCleanPath(req.url);
        return p.includes('/debts') || p.startsWith('/api/debts/');
      });
      
      if (hasTxModifications) {
        for (let i = 0; i < data.length; i++) {
          const debtorId = data[i].id;
          data[i].totalDebt = await calculateOfflineTotalDebt(debtorId, data[i].totalDebt || 0);
        }
      }
    }
    
    return data;
  } catch (error) {
    console.error('[OfflineSync] Error applying offline queue to data:', error);
    return data;
  }
}

// Guardar una petición de escritura en la cola offline
async function enqueueRequest(url, options) {
  try {
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = queueJson ? JSON.parse(queueJson) : [];

    const requestData = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      url,
      method: options.method || 'POST',
      headers: options.headers || {},
      body: options.body || null,
      timestamp: new Date().toISOString(),
    };

    queue.push(requestData);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[OfflineSync] Petición agregada a la cola offline: ${requestData.method} ${requestData.url}`);
    return requestData.id;
  } catch (error) {
    console.error('[OfflineSync] Error al encolar petición offline:', error);
    return null;
  }
}

// Obtener todas las peticiones encoladas
export async function getOfflineQueue() {
  try {
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return queueJson ? JSON.parse(queueJson) : [];
  } catch (error) {
    console.error('[OfflineSync] Error al leer la cola:', error);
    return [];
  }
}

// Eliminar petición de la cola
async function removeRequestFromQueue(requestId) {
  try {
    const queueJson = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!queueJson) return;
    let queue = JSON.parse(queueJson);
    queue = queue.filter(req => req.id !== requestId);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.error('[OfflineSync] Error al remover petición:', error);
  }
}

// Limpiar toda la cola
export async function clearOfflineQueue() {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (error) {
    console.error('[OfflineSync] Error al limpiar cola:', error);
  }
}

// Procesar y sincronizar todas las peticiones pendientes
export async function syncOfflineQueue(onSuccessItem, onFailureItem) {
  try {
    const online = await isConnected();
    if (!online) {
      console.log('[OfflineSync] Intento de sincronización cancelado: Dispositivo aún sin conexión.');
      return { success: false, error: 'Aún sin conexión' };
    }

    const queue = await getOfflineQueue();
    if (queue.length === 0) {
      return { success: true, count: 0 };
    }

    console.log(`[OfflineSync] Iniciando sincronización de ${queue.length} peticiones...`);
    let processed = 0;
    const idMap = await getIdMap(); // Cargar mapa de IDs persistido en AsyncStorage

    for (const req of queue) {
      try {
        // Reemplazar IDs temporales en la URL y en el cuerpo de la petición
        let resolvedUrl = req.url;
        let resolvedBody = req.body;

        for (const [tempId, realId] of Object.entries(idMap)) {
          resolvedUrl = resolvedUrl.replace(tempId, realId);
          if (resolvedBody && typeof resolvedBody === 'string') {
            const escapedTempId = tempId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            resolvedBody = resolvedBody.replace(new RegExp(escapedTempId, 'g'), realId);
          }
        }

        // Si la petición sigue teniendo un ID temporal no resuelto en la URL o en el cuerpo,
        // significa que el elemento principal nunca se creó con éxito o se perdió su mapeo.
        // Ignoramos y removemos de la cola para no trabar la sincronización de las demás peticiones.
        if (resolvedUrl.includes('temp_') || (resolvedBody && typeof resolvedBody === 'string' && resolvedBody.includes('temp_'))) {
          console.warn(`[OfflineSync] Ignorando petición con ID temporal no resuelto para evitar bloqueo: ${req.method} ${resolvedUrl}`);
          await removeRequestFromQueue(req.id);
          processed++;
          
          const resolvedReq = {
            ...req,
            url: resolvedUrl,
            body: resolvedBody
          };
          if (onFailureItem) onFailureItem(resolvedReq, 'ID temporal no resuelto');
          continue;
        }

        const response = await fetch(resolvedUrl, {
          method: req.method,
          headers: {
            ...req.headers,
            'Content-Type': 'application/json',
          },
          body: resolvedBody,
        });

        if (response.ok) {
          const resData = await response.json().catch(() => ({}));
          // Si el servidor asignó un nuevo ID (caso POST), guardarlo en el mapa de resolución
          if (resData && resData.id) {
            const realId = String(resData.id);
            idMap[`temp_${req.id}`] = realId;
            idMap[`temp_tx_${req.id}`] = realId;
            idMap[`temp_batch_${req.id}`] = realId;
            idMap[`temp_order_item_${req.id}`] = realId;
            await saveIdMap(idMap); // Guardar cambios en el almacenamiento persistente
          }

          await removeRequestFromQueue(req.id);
          processed++;

          const resolvedReq = {
            ...req,
            url: resolvedUrl,
            body: resolvedBody,
            resolvedId: resData?.id
          };
          if (onSuccessItem) onSuccessItem(resolvedReq);
        } else {
          // Si es un error del cliente (4xx), removemos para no trabar la cola
          if (response.status >= 400 && response.status < 500) {
            const errData = await response.json().catch(() => ({}));
            await removeRequestFromQueue(req.id);
            if (onFailureItem) onFailureItem(req, errData.error || `Error ${response.status}`);
          } else {
            // Si es un error de servidor (500, etc), nos detenemos para reintentar luego
            throw new Error(`Error en servidor: ${response.status}`);
          }
        }
      } catch (err) {
        console.error(`[OfflineSync] Error procesando petición ${req.method} ${req.url}:`, err);
        return { success: false, processed, total: queue.length };
      }
    }

    console.log('[OfflineSync] Sincronización offline completada con éxito.');
    return { success: true, processed, total: queue.length };
  } catch (error) {
    console.error('[OfflineSync] Error en la sincronización offline:', error);
    return { success: false, error: error.message };
  }
}

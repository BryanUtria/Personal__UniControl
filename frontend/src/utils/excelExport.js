import * as XLSX from 'xlsx';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Exporta un array de objetos JSON a un archivo .xlsx.
 * Funciona de manera nativa en Web y mediante FileSystem/Sharing en iOS/Android.
 * 
 * @param {Array<Object>} data Datos a exportar
 * @param {string} fileName Nombre del archivo sin extensión
 * @param {string} sheetName Nombre de la hoja de cálculo
 */
export async function exportToExcel(data, fileName = 'Reporte', sheetName = 'Datos') {
  if (!data || data.length === 0) {
    throw new Error('No hay datos para exportar.');
  }

  // Crear la hoja y el libro
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  if (Platform.OS === 'web') {
    // En web, XLSX.writeFile gestiona la descarga automáticamente
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  } else {
    // En móviles, generamos base64 y usamos FileSystem + Sharing
    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileUri = `${FileSystem.documentDirectory}${fileName}.xlsx`;

    await FileSystem.writeAsStringAsync(fileUri, wbout, {
      encoding: 'base64',
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Exportar ${fileName}`,
        UTI: 'com.microsoft.excel.xlsx',
      });
    } else {
      throw new Error('La función de compartir no está disponible en este dispositivo.');
    }
  }
}

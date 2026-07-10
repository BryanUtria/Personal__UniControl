export const formatDateToLocal = (dateString) => {
  if (!dateString) return '';
  
  let utcString = dateString;
  // Si la fecha viene de MySQL nativo como "2026-07-01 08:03:42" (sin 'T' ni zona horaria),
  // la forzamos a UTC cambiando el espacio por 'T' y agregando una 'Z' al final.
  // Así el navegador entenderá que está en UTC y la convertirá automáticamente a la hora local.
  if (typeof dateString === 'string' && !dateString.includes('T') && !dateString.includes('Z')) {
    utcString = dateString.replace(' ', 'T') + 'Z';
  }

  const date = new Date(utcString);
  
  // Verificamos si la fecha resultante es inválida
  if (isNaN(date.getTime())) return dateString;

  // Formato: 01 jul 2026, 03:03 a. m.
  return date.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

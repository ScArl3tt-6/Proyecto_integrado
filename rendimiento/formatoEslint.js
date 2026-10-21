'use strict';
// Convierte la salida JSON de ESLint en una lista legible para la evidencia del informe
let datos = '';
process.stdin.on('data', (c) => { datos += c; }).on('end', () => {
  const resultados = JSON.parse(datos);
  let errores = 0; let avisos = 0;
  for (const archivo of resultados) {
    const ruta = archivo.filePath.split(/sst-kotoduo[\\/]/)[1].split('\\').join('/');
    for (const m of archivo.messages) {
      if (m.severity === 2) errores += 1; else avisos += 1;
      console.log(`${ruta}:${m.line}:${m.column}  ${m.severity === 2 ? 'error' : 'aviso'}  ${m.ruleId || '-'}  ${m.message}`);
    }
  }
  console.log(`Total: ${errores} errores, ${avisos} avisos`);
});

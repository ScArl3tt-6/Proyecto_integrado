'use strict';
// Punto 4 de la revisión del equipo (20-11-2026): una versión de diseño rechazada mostraba el chip
// "Detenido" (vocabulario de trabajo.estado, prestado por error) y el texto crudo "RECHAZADO" sin
// traducir (ver DEF-44). Esta prueba fija, para cada vocabulario de estado de la aplicación, que
// cada valor interno tenga su propia etiqueta humana, distinta de las demás y nunca igual al
// nombre interno sin traducir — así una futura etiqueta nueva sin traducir, o un préstamo por
// error entre vocabularios distintos, rompe la prueba en vez de llegar a pantalla.
//
// web/js/componentes.js es un módulo ES (lo carga el navegador con <script type="module">, sin
// empaquetador); se importa aquí con import() dinámico, que Node resuelve con las reglas normales
// de ESM gracias a web/js/package.json ("type": "module") sin tocar la configuración de Jest.
describe('Etiquetas de estado: una por valor, sin duplicados ni valores crudos', () => {
  let componentes;

  beforeAll(async () => {
    componentes = await import('../../web/js/componentes.js');
  });

  function verificarEtiquetasPropias(mapa, nombreMapa) {
    const claves = Object.keys(mapa);
    const valores = claves.map((clave) => mapa[clave]);
    expect(valores.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    // Ninguna etiqueta puede ser el propio valor interno sin traducir (p. ej. "RECHAZADO" tal cual)
    for (const clave of claves) expect(mapa[clave]).not.toBe(clave);
    // Sin dos estados del MISMO vocabulario compartiendo la misma etiqueta
    expect(new Set(valores).size).toBe(valores.length);
  }

  test('TEXTO_ESTADO (trabajo): SOLICITADO/EN_DISENO/PENDIENTE_APROBACION/EN_PRODUCCION/DETENIDO/TERMINADO, cada uno con su propia etiqueta', () => {
    verificarEtiquetasPropias(componentes.TEXTO_ESTADO, 'TEXTO_ESTADO');
    expect(Object.keys(componentes.TEXTO_ESTADO).sort()).toEqual(
      ['DETENIDO', 'EN_DISENO', 'EN_PRODUCCION', 'PENDIENTE_APROBACION', 'SOLICITADO', 'TERMINADO'].sort(),
    );
  });

  test('TEXTO_ESTADO_DISENO (versión de diseño): PENDIENTE/APROBADO/RECHAZADO, cada uno con su propia etiqueta', () => {
    verificarEtiquetasPropias(componentes.TEXTO_ESTADO_DISENO, 'TEXTO_ESTADO_DISENO');
    expect(Object.keys(componentes.TEXTO_ESTADO_DISENO).sort()).toEqual(['APROBADO', 'PENDIENTE', 'RECHAZADO']);
  });

  // DEF-44 específicamente: una versión de diseño rechazada/aprobada nunca debe mostrar la
  // etiqueta de un TRABAJO detenido/terminado, aunque ambos vocabularios compartan la pantalla.
  test('DEF-44: la etiqueta de una versión de diseño nunca es la de un estado de trabajo distinto', () => {
    expect(componentes.TEXTO_ESTADO_DISENO.RECHAZADO).not.toBe(componentes.TEXTO_ESTADO.DETENIDO);
    expect(componentes.TEXTO_ESTADO_DISENO.APROBADO).not.toBe(componentes.TEXTO_ESTADO.TERMINADO);
    expect(componentes.TEXTO_ESTADO_DISENO.RECHAZADO).toBe('Rechazada');
    expect(componentes.TEXTO_ESTADO_DISENO.APROBADO).toBe('Aprobada');
    expect(componentes.TEXTO_ESTADO_DISENO.PENDIENTE).toBe('Pendiente');
  });

  // listaEtapas() reutiliza, a propósito, el vocabulario de trabajo.estado para pintar el chip de
  // una ETAPA (COMPLETADA→TERMINADO, EN_CURSO→EN_PRODUCCION, PENDIENTE→SOLICITADO): es un préstamo
  // deliberado entre conceptos de progreso equivalentes, no un error — pero las tres etiquetas
  // resultantes deben seguir siendo distintas entre sí.
  test('el chip de una etapa (COMPLETADA/EN_CURSO/PENDIENTE) usa tres etiquetas de trabajo.estado distintas entre sí', () => {
    const mapaEtapaATrabajo = { COMPLETADA: 'TERMINADO', EN_CURSO: 'EN_PRODUCCION', PENDIENTE: 'SOLICITADO' };
    const etiquetas = Object.values(mapaEtapaATrabajo).map((estadoTrabajo) => componentes.TEXTO_ESTADO[estadoTrabajo]);
    expect(new Set(etiquetas).size).toBe(3);
  });
});

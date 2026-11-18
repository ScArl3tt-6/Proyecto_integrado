'use strict';
// Genera docs/GUIA_BASES_DE_DATOS.docx a partir del contenido verificado de este archivo.
// Reproducible: `node scripts/generar-guia-bases.js` lo vuelve a crear siempre igual (salvo la
// fecha de generación). Herramienta usada: librería "docx" (JavaScript puro, sin binarios
// externos como pandoc, que no está instalado en este equipo). No lee ni imprime el .env: todo
// el contenido sobre credenciales usa el marcador <CLAVE> en vez de un valor real.
const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType,
} = require('docx');

const RUTA_SALIDA = path.join(__dirname, '..', 'docs', 'GUIA_BASES_DE_DATOS.docx');
const GRIS = 'F2F2F2';

function h1(texto) { return new Paragraph({ text: texto, heading: HeadingLevel.HEADING_1 }); }
function h2(texto) { return new Paragraph({ text: texto, heading: HeadingLevel.HEADING_2 }); }
function h3(texto) { return new Paragraph({ text: texto, heading: HeadingLevel.HEADING_3 }); }

function p(texto, opciones = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: texto, ...opciones })] });
}

function nota(texto) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: `⚠ ${texto}`, italics: true, color: '8A4B00' })],
  });
}

function noVerificado(texto) {
  return new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: `No verificado: ${texto}`, italics: true, color: '8A1C1C' })],
  });
}

function bullet(texto) {
  return new Paragraph({ text: texto, bullet: { level: 0 }, spacing: { after: 60 } });
}

function celda(texto, { cabecera = false, ancho } = {}) {
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: cabecera ? { type: ShadingType.CLEAR, fill: '1C2541', color: 'auto' } : undefined,
    children: [new Paragraph({
      children: [new TextRun({ text: String(texto), bold: cabecera, color: cabecera ? 'FFFFFF' : undefined, size: 20 })],
    })],
  });
}

function tabla(cabeceras, filas, anchos) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: cabeceras.map((c, i) => celda(c, { cabecera: true, ancho: anchos?.[i] })) }),
      ...filas.map((fila) => new TableRow({ children: fila.map((c, i) => celda(c, { ancho: anchos?.[i] })) })),
    ],
  });
}

// Bloque de texto monoespaciado (consultas SQL, salidas de consola) dentro de una celda sombreada.
function pre(lineas) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [new TableCell({
          shading: { type: ShadingType.CLEAR, fill: GRIS, color: 'auto' },
          children: lineas.map((linea) => new Paragraph({
            spacing: { after: 0 },
            children: [new TextRun({ text: linea || ' ', font: 'Consolas', size: 18 })],
          })),
        })],
      }),
    ],
  });
}

function espacio() { return new Paragraph({ text: '', spacing: { after: 80 } }); }

const hoy = new Date().toISOString().slice(0, 10);

const contenido = [
  new Paragraph({ text: 'Guía de bases de datos — SST Kotoduo', heading: HeadingLevel.TITLE }),
  p(`Generada automáticamente el ${hoy} por scripts/generar-guia-bases.js, a partir de `
    + 'docs/VER_LAS_BASES_DE_DATOS.md y del código real del proyecto (no de memoria ni de supuestos). '
    + 'Cada afirmación técnica se verificó contra el código, una ejecución real o un archivo de '
    + 'evidencias existente. Donde no fue posible comprobar algo en este entorno de trabajo, el '
    + 'texto dice explícitamente "No verificado" en vez de inventarlo.'),
  espacio(),

  // 1 ----------------------------------------------------------------------------------------
  h1('1. Mapa: qué dato vive en cada motor, y por qué'),
  tabla(
    ['Dato', 'Motor', 'Por qué'],
    [
      ['Usuarios, roles, áreas, sesiones', 'PostgreSQL',
        'Identidad y permisos: forma fija, con restricciones que deben cumplirse siempre '
        + '(correo UNIQUE, rol y área por llave foránea). Es la base de todo el control de acceso.'],
      ['Trabajos, tipos de trabajo, etapas y su plantilla', 'PostgreSQL',
        'El flujo de un trabajo tiene estados y transiciones estrictas (SOLICITADO → EN_DISENO → '
        + '… → TERMINADO) protegidas con CHECK y transacciones; el panel y los listados necesitan '
        + 'JOIN eficientes, apoyados en índices (sección 2).'],
      ['Decisión de aprobación de un diseño (quién, cuándo, qué decidió)', 'PostgreSQL',
        'Es un registro que nunca se modifica, solo se inserta una vez (tabla aprobacion_diseno, '
        + 'con UNIQUE sobre id_diseno): un hecho legal/trazable con integridad referencial fuerte '
        + 'hacia diseño y usuario.'],
      ['Catálogo de materiales y su asociación a un trabajo', 'PostgreSQL',
        'Relación simple tabla-a-tabla (trabajo_material) con una cantidad numérica que conviene '
        + 'poder sumar y filtrar con SQL.'],
      ['Propuestas de diseño: archivos, especificaciones técnicas, comentarios', 'MongoDB',
        'La forma de las "especificaciones" cambia según el tipo de trabajo (un bordado tiene '
        + 'puntadas y colores; un letrero tiene medidas y materiales distintos). Forzar columnas '
        + 'fijas para esto sería muy rígido (columnas casi siempre NULL) o exigiría un modelo '
        + 'entidad-atributo-valor más complicado que guardar el documento tal cual.'],
      ['Bitácora de auditoría (eventos del sistema)', 'MongoDB',
        'Un registro de solo inserción, de alto volumen, sin necesidad de integridad referencial '
        + 'estricta con las demás tablas: un documento por evento es más simple y más barato de '
        + 'escribir que una fila relacional con columnas opcionales para cada tipo de detalle.'],
    ],
    [28, 14, 58],
  ),
  espacio(),
  noVerificado('esta tabla no cita el Informe 2 textualmente porque ese documento no está '
    + 'disponible en este entorno de trabajo (no es un archivo del repositorio). La justificación '
    + 'de arriba se basa en las restricciones reales del esquema (src/db/esquema.sql) y del código '
    + '(src/modulos/disenos/servicioDisenos.js), no en una cita del informe. Quien tenga el Informe '
    + '2 a mano puede completar la referencia exacta de la sección de diseño de datos.'),

  // 2 ----------------------------------------------------------------------------------------
  h1('2. PostgreSQL 16'),
  h2('2.1 Servicio, puerto y datos'),
  bullet('Servicio de Windows: "postgresql-x64-16" ("PostgreSQL Server 16"). Se revisa en Servicios de Windows (services.msc) que esté "En ejecución".'),
  bullet('Puerto que usa este proyecto: 5432 (el que trae SST_PG_URL en tu .env; confirmado también en postgresql.conf de la instalación 16).'),
  bullet('Dónde están los datos: la carpeta de instalación de PostgreSQL 16 (por defecto, C:\\Program Files\\PostgreSQL\\16\\data). Borrar esa carpeta borra todo: no hay respaldo automático configurado todavía (limitación conocida).'),
  nota('en este equipo también hay instalada PostgreSQL 18 (servicio "postgresql-x64-18"), escuchando en el puerto 5433 (verificado en su propio postgresql.conf). Es un servidor totalmente aparte y vacío para este proyecto. Si pgAdmin se conecta al 5433 pensando que es "el Postgres del proyecto", no va a encontrar la base sst_kotoduo ni sus 12 tablas. Usa siempre el puerto 5432 para SST Kotoduo.'),
  espacio(),
  h2('2.2 Conectarse con pgAdmin 4'),
  bullet('Clic derecho en Servers → Register → Server…'),
  bullet('Pestaña General: Name = "SST Kotoduo (local)".'),
  bullet('Pestaña Connection: Host 127.0.0.1, Port 5432, Maintenance database "postgres", Username "postgres" (pgAdmin pedirá su contraseña; es la del superusuario, nunca se guarda en el proyecto).'),
  bullet('Para ver la base igual que la aplicación (mínimo privilegio): registra un segundo servidor con Username "sst_app" y la contraseña que está en SST_PG_URL de tu .env, entre "sst_app:" y "@127.0.0.1" (reemplázala por <CLAVE> si vas a escribir estos pasos en otro lado).'),
  bullet('Dentro de cualquiera de los dos: Databases → sst_kotoduo → Schemas → public → Tables, para ver las 12 tablas.'),
  espacio(),
  h2('2.3 Conectarse con psql'),
  pre(['psql -h 127.0.0.1 -p 5432 -U sst_app -d sst_kotoduo', '# pide la contraseña de forma oculta; no la escribas como parte del comando']),
  p('No se escribe la contraseña en la misma línea del comando (por ejemplo con PGPASSWORD=... al inicio) porque esos comandos suelen quedar guardados en el historial de la terminal.'),
  espacio(),
  h2('2.4 Las 12 tablas'),
  tabla(
    ['Tabla', 'Para qué sirve'],
    [
      ['rol', 'Catálogo fijo de los 5 perfiles (ADMINISTRADOR, PRODUCCION, DISENO, VENDEDOR, OPERARIO).'],
      ['area', 'Áreas de la empresa (Ventas, Diseño, Bordado, Sublimación, Letreros, Grabado, Impresión gran formato, Administración).'],
      ['usuario', 'Cuentas: nombre, correo único, hash de la contraseña, rol, área, estado, intentos fallidos y bloqueo.'],
      ['sesion', 'Una fila por sesión activa o cerrada: token de renovación (con hash), vencimiento y si está revocada.'],
      ['tipo_trabajo', 'Catálogo de tipos de trabajo (Bordado, Sublimación, Letrero, Grabado, Impresión gran formato).'],
      ['etapa_plantilla', 'Las etapas que le corresponden a cada tipo de trabajo, en orden, y a qué área pertenece cada una.'],
      ['trabajo', 'Cada solicitud: código único, tipo, descripción, cantidad, fecha comprometida y estado.'],
      ['etapa_trabajo', 'Una fila por cada etapa real de un trabajo concreto (copiada de etapa_plantilla al aprobarse el diseño), con su propio estado y responsable.'],
      ['diseno', 'Cada versión de una propuesta de diseño enviada para un trabajo: quién la hizo y la referencia al documento de MongoDB (ver sección 3.5).'],
      ['aprobacion_diseno', 'La decisión (aprobado/rechazado) sobre una versión de diseño, con motivo obligatorio si se rechaza.'],
      ['material', 'Catálogo de materiales (hilo, papel transfer, tinta, vinilo, placa MDF) con su unidad de medida.'],
      ['trabajo_material', 'Qué materiales y en qué cantidad/medida se asociaron a un trabajo.'],
    ],
    [25, 75],
  ),
  espacio(),
  h2('2.5 Llaves foráneas e integridad referencial'),
  p('Salida real de rendimiento/evidenciaBases.js (evidencias/evidencia_bases_datos.txt):'),
  tabla(
    ['Tabla', 'Columna', 'Referencia', 'Al eliminar'],
    [
      ['aprobacion_diseno', 'id_aprobador', 'usuario', 'RESTRICT'],
      ['aprobacion_diseno', 'id_diseno', 'diseno', 'RESTRICT'],
      ['diseno', 'id_disenador', 'usuario', 'RESTRICT'],
      ['diseno', 'id_trabajo', 'trabajo', 'RESTRICT'],
      ['etapa_plantilla', 'id_area', 'area', 'RESTRICT'],
      ['etapa_plantilla', 'id_tipo', 'tipo_trabajo', 'RESTRICT'],
      ['etapa_trabajo', 'id_etapa_plantilla', 'etapa_plantilla', 'RESTRICT'],
      ['etapa_trabajo', 'id_responsable', 'usuario', 'RESTRICT'],
      ['etapa_trabajo', 'id_trabajo', 'trabajo', 'RESTRICT'],
      ['sesion', 'id_usuario', 'usuario', 'CASCADE'],
      ['trabajo', 'id_tipo', 'tipo_trabajo', 'RESTRICT'],
      ['trabajo', 'id_vendedor', 'usuario', 'RESTRICT'],
      ['trabajo_material', 'id_material', 'material', 'RESTRICT'],
      ['trabajo_material', 'id_trabajo', 'trabajo', 'CASCADE'],
      ['usuario', 'id_area', 'area', 'RESTRICT'],
      ['usuario', 'id_rol', 'rol', 'RESTRICT'],
    ],
  ),
  p('Casi todo es RESTRICT a propósito: nada en el código borra usuarios ni trabajos (se desactivan '
    + 'o cambian de estado), así que impedir el borrado protege el historial por accidente. Las dos '
    + 'excepciones son deliberadas: una sesión no tiene sentido sin su usuario (CASCADE), y la '
    + 'asociación de materiales tampoco tiene sentido sin el trabajo (CASCADE).'),
  espacio(),
  h2('2.6 Índices'),
  tabla(
    ['Índice', 'Tabla(s)', 'Pensado para'],
    [
      ['idx_trabajo_estado', 'trabajo(estado)', 'Filtrar trabajos por estado (listados, panel).'],
      ['idx_etapa_trabajo_estado', 'etapa_trabajo(estado, id_etapa_plantilla)', 'Encontrar la etapa EN_CURSO de cada trabajo por área (HU-04, mis actividades).'],
      ['idx_diseno_trabajo', 'diseno(id_trabajo)', 'Listar las versiones de diseño de un trabajo.'],
      ['idx_etapa_plantilla_area', 'etapa_plantilla(id_area)', 'Filtrar etapas por área.'],
      ['idx_trabajo_compromiso', 'trabajo(estado, fecha_compromiso)', 'Listados ordenados/filtrados por fecha comprometida dentro de un estado.'],
    ],
  ),
  espacio(),
  p('Medición real con 5000 trabajos sintéticos, con y sin estos índices (evidencias/indices_postgresql.txt, node rendimiento/indices.js):'),
  tabla(
    ['Consulta', 'Con índices', 'Sin índices', 'Mejora'],
    [
      ['Actividades del área (HU-04)', '0.839 ms', '0.987 ms', '15.0 %'],
      ['Panel general (HU-06)', '11.114 ms', '8.492 ms', '-30.9 % (ver nota)'],
      ['Listado por estado (sección 4.2)', '0.087 ms', '1.233 ms', '92.9 %'],
    ],
  ),
  espacio(),
  nota('la consulta del Panel general NO mejoró con el índice en esta medición: salió más lenta con '
    + 'el índice puesto (11.114 ms) que sin él (8.492 ms), probablemente porque el planificador de '
    + 'PostgreSQL igual eligió un recorrido secuencial completo con esta cantidad de filas. Se deja '
    + 'constancia tal cual, sin maquillarlo: no todos los índices creados mejoran todas las consultas.'),

  // Prueba de integridad
  h2('2.7 Prueba de integridad (intentos de INSERT/UPDATE inválidos)'),
  p('Salida real de node rendimiento/evidenciaBases.js. Cada intento debe fallar y mostrar el error de PostgreSQL correspondiente:'),
  pre([
    '[RECHAZADO] Etapa para un trabajo inexistente (FK):',
    '  inserción o actualización en la tabla «etapa_trabajo» viola la llave foránea «etapa_trabajo_id_trabajo_fkey»',
    '[RECHAZADO] Cantidad igual a cero (CHECK):',
    '  el nuevo registro para la relación «trabajo» viola la restricción «check» «trabajo_cantidad_check»',
    '[RECHAZADO] Estado fuera del dominio (CHECK):',
    '  el nuevo registro para la relación «trabajo» viola la restricción «check» «trabajo_estado_check»',
    '[RECHAZADO] Rechazo sin motivo (CHECK):',
    '  el nuevo registro para la relación «aprobacion_diseno» viola la restricción «check» «aprobacion_diseno_check»',
    '[RECHAZADO] Eliminar un trabajo con historial (RESTRICT):',
    '  update o delete en «trabajo» viola la llave foránea «etapa_trabajo_id_trabajo_fkey» en la tabla «etapa_trabajo»',
    '[RECHAZADO] Correo duplicado (UNIQUE):',
    '  llave duplicada viola restricción de unicidad «usuario_correo_key»',
  ]),
  p('Qué debe verse: las 6 líneas con el prefijo "[RECHAZADO]" y el mensaje de PostgreSQL citado arriba. Si en vez de eso una de estas operaciones se completa sin error, es un defecto real que hay que registrar en evidencias/defectos.md, no ocultar.'),
  espacio(),
  h2('2.8 Consultas de ejemplo (demostración)'),
  p('(1) Trabajos con su etapa vigente y responsable — debe verse una fila por cada etapa de cada trabajo, ordenadas por código:'),
  pre([
    'SELECT t.codigo, t.estado, et.orden, ep.nombre AS etapa, et.estado AS estado_etapa, u.nombre AS responsable',
    '  FROM trabajo t',
    '  JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo',
    '  JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla',
    '  LEFT JOIN usuario u ON u.id_usuario = et.id_responsable',
    ' ORDER BY t.codigo, et.orden;',
  ]),
  p('(2) Historial de aprobaciones de diseño — debe verse quién decidió, qué decidió y cuándo:'),
  pre([
    'SELECT t.codigo, d.version, a.decision, a.motivo, u.nombre AS aprobador, a.decidido_en',
    '  FROM aprobacion_diseno a',
    '  JOIN diseno d ON d.id_diseno = a.id_diseno',
    '  JOIN trabajo t ON t.id_trabajo = d.id_trabajo',
    '  JOIN usuario u ON u.id_usuario = a.id_aprobador',
    ' ORDER BY a.decidido_en DESC;',
  ]),
  p('(3) Trabajos atrasados — no es una columna, se calcula igual que en la aplicación (fecha comprometida ya pasada y el trabajo no está Terminado):'),
  pre([
    'SELECT codigo, estado, fecha_compromiso',
    '  FROM trabajo',
    ' WHERE estado <> \'TERMINADO\' AND fecha_compromiso < CURRENT_DATE;',
  ]),

  // 3 ----------------------------------------------------------------------------------------
  h1('3. MongoDB'),
  h2('3.1 Cómo iniciarlo y en qué se diferencia del servicio de Windows'),
  bullet('Se inicia con "npm run mongo:iniciar". Si el puerto 27027 ya está escuchando, el script no hace nada más que revisar los usuarios; si no, arranca su propio mongod con --auth, en 127.0.0.1:27027, guardando los datos en la carpeta datos/mongo del propio proyecto (ignorada por git).'),
  nota('en este equipo hay además un servicio de Windows llamado "MongoDB" ("MongoDB Server"), que corre aparte, sin relación con el proyecto, escuchando en el puerto por defecto 27017 (ambos hechos verificados con Get-Service y Get-NetTCPConnection). Conectarse a 27017 muestra ese Mongo genérico, no sst_kotoduo. Usa siempre el puerto 27027 para este proyecto.'),
  espacio(),
  h2('3.2 Conectarse con MongoDB Compass'),
  bullet('Add new connection → pega la URI de abajo, reemplazando <CLAVE> por la contraseña real de sst_admin, que queda guardada (solo en tu máquina) en .mongo-admin-credenciales.txt después de "npm run mongo:iniciar":'),
  pre(['mongodb://sst_admin:<CLAVE>@127.0.0.1:27027/admin?authSource=admin']),
  bullet('Conectado, en el panel izquierdo aparece la base sst_kotoduo con sus colecciones.'),
  espacio(),
  h2('3.3 Conectarse con mongosh'),
  pre(['mongosh "mongodb://sst_admin:<CLAVE>@127.0.0.1:27027/admin?authSource=admin"']),
  espacio(),
  h2('3.4 Colecciones e índices'),
  tabla(
    ['Colección', 'Para qué sirve', 'Índices'],
    [
      ['propuestas_diseno', 'Una propuesta de diseño por versión: archivos (nombre, tipo, tamaño, sha256 y archivoId: el _id real en GridFS), especificaciones técnicas de forma libre y comentarios. Tiene un validador $jsonSchema que rechaza documentos con forma inválida (por ejemplo, un archivo .svg o uno sin archivoId).', '{_id:1}, {trabajoCodigo:1, version:-1}'],
      ['bitacora_eventos', 'Un documento por evento del sistema (RNF-03): tipo, usuario, entidad afectada, detalle y fecha. Solo se inserta, nunca se modifica ni se borra.', '{_id:1}, {"entidad.codigo":1, fecha:-1}, {tipo:1, fecha:-1}'],
      ['disenos.files / disenos.chunks', 'El bucket de GridFS (sección 3.6): el contenido real de cada archivo de una propuesta, partido en fragmentos de hasta 255 KB. Las crea y las indexa el driver de MongoDB automáticamente, no un script del proyecto.', '(automáticos del driver) {files_id:1, n:1} en chunks; {filename:1, uploadDate:1} en files'],
    ],
    [20, 60, 20],
  ),
  espacio(),
  h2('3.5 Relación diseno.ref_documento ↔ _id de MongoDB (paso a paso con un ejemplo real)'),
  p('Cuando Diseño envía una propuesta (src/modulos/disenos/servicioDisenos.js, función enviarPropuesta), el servidor:'),
  bullet('1) Genera un ObjectId de MongoDB ANTES de escribir nada (const idDocumento = new ObjectId()).'),
  bullet('2) Dentro de una misma transacción de PostgreSQL, inserta la fila en "diseno" guardando ese id, en su forma de texto hexadecimal, en la columna ref_documento (CHAR(24)).'),
  bullet('3) Si esa transacción de PostgreSQL tiene éxito, inserta en Mongo, en la colección propuestas_diseno, un documento cuyo _id es exactamente ese mismo ObjectId.'),
  bullet('4) Si la escritura en Mongo falla, el código borra ese documento si llegó a crearse y relanza el error, de modo que la transacción relacional (que ya hizo COMMIT) no quede con una referencia a un documento que nunca existió sin que el error se note. No hay una transacción distribuida real entre ambos motores: lo que hay es este orden (PostgreSQL primero, Mongo después, con limpieza si Mongo falla), que es una decisión de diseño explícita, no una garantía two-phase-commit.'),
  espacio(),
  p('Ejemplo real, tomado de evidencias/evidencia_bases_datos.txt:'),
  pre([
    '-- En PostgreSQL:',
    'SELECT ref_documento FROM diseno WHERE id_diseno = 1;',
    '-- resultado: 6afa51b8a5f4125238d03577',
    '',
    '-- En MongoDB, con ese mismo valor:',
    'db.propuestas_diseno.findOne({ _id: ObjectId("6afa51b8a5f4125238d03577") })',
    '-- resultado: el documento con trabajoCodigo "KT-2026-0001", idDiseno 1, version 1,',
    '-- el archivo "escudo_aromos_v1.pdf" y sus especificaciones de bordado.',
  ]),
  espacio(),
  h2('3.6 GridFS'),
  p('Implementado en la Fase 1 (src/modulos/disenos/servicioDisenos.js). Antes de esta fase solo '
    + 'se recibía la cabecera del archivo en base64 para validar su firma '
    + '(src/dominio/archivosDiseno.js); ni el archivo completo ni su contenido real se guardaban en '
    + 'ningún lado. Ahora Diseño envía el archivo completo en base64, el servidor mide su tamaño y '
    + 'valida su firma sobre el contenido real (ya no sobre un dato declarado por el cliente), y lo '
    + 'guarda en el bucket de GridFS "disenos" (colecciones disenos.files y disenos.chunks dentro de '
    + 'sst_kotoduo). El _id real que GridFS le asigna queda guardado, en texto hexadecimal, en '
    + 'archivos[].archivoId dentro del documento de propuestas_diseno.'),
  bullet('Quién puede verlo/descargarlo: GET /api/disenos/:idDiseno/archivos/:idArchivo, con el mismo permiso DISENO_VER que ya protegía el detalle (Producción y Diseño). La ruta verifica que ese archivoId pertenezca de verdad a ese idDiseno antes de servirlo, para que nadie con el permiso pueda adivinar el id de un archivo de otro trabajo.'),
  bullet('Si algo falla después de subir el archivo (el trabajo no existe, la transacción de PostgreSQL falla, Mongo falla al guardar la propuesta), el archivo ya subido se borra de GridFS: no quedan archivos reales sin ningún diseño que los referencie (ver CP-16 y CP-54, y DEF-10 en evidencias/defectos.md).'),
  espacio(),
  p('Ejemplo real, tomado de evidencias/fase1_archivos_diseno.txt (verificado con un navegador real, no solo con las pruebas automáticas):'),
  pre([
    '-- En MongoDB, el archivo real de una propuesta:',
    'db.propuestas_diseno.findOne({ idDiseno: 8 }).archivos[0].archivoId',
    '-- resultado: "6afcf585d3b3d88c67ec02d6"',
    '',
    '-- Pedido por HTTP con permiso DISENO_VER:',
    'GET /api/disenos/8/archivos/6afcf585d3b3d88c67ec02d6',
    '-- resultado: 200, Content-Type: application/pdf, 10409 bytes, idénticos byte a byte',
    '-- al PDF real que Diseño adjuntó en el formulario (no solo su cabecera).',
  ]),

  // 4 ----------------------------------------------------------------------------------------
  h1('4. Roles y mínimo privilegio'),
  h2('4.1 PostgreSQL'),
  tabla(
    ['Rol', 'Para qué sirve', 'Puede', 'NO puede'],
    [
      ['postgres (superusuario)', 'Instalación inicial únicamente, ejecutado por una persona.', 'Todo.', 'N/A — su contraseña nunca se guarda en el proyecto ni se vuelve a pedir después de "npm run db:crear".'],
      ['sst_propietario', 'Dueño del esquema; aplica/migra esquema.sql y semilla.sql.', 'CREATE/ALTER/DROP sobre sus propios objetos en sst_kotoduo; SELECT/INSERT/UPDATE/DELETE en sus tablas.', 'SUPERUSER, CREATEDB, CREATEROLE (ninguno de los tres atributos).'],
      ['sst_app', 'La aplicación en producción (SST_PG_URL).', 'SELECT en 6 tablas de catálogo; SELECT+INSERT+UPDATE en usuario, sesion, trabajo, etapa_trabajo, diseno; SELECT+INSERT en aprobacion_diseno.', 'DELETE en ninguna tabla; CREATE TABLE; DROP TABLE (verificado: ver 4.3).'],
      ['sst_pruebas', 'La suite automática de pruebas (SST_PG_PRUEBAS_URL).', 'CREATEDB: crea y borra sus propias bases temporales sst_prueba_xxxx.', 'No tiene ningún permiso dentro de sst_kotoduo (no los necesita: usa bases propias y las destruye al terminar).'],
    ],
    [16, 22, 34, 28],
  ),
  espacio(),
  h2('4.2 MongoDB'),
  tabla(
    ['Rol', 'Para qué sirve', 'Puede', 'NO puede'],
    [
      ['sst_admin', 'Inspección manual (Compass); rol root sobre la base admin.', 'Todo sobre el servidor.', 'N/A — su contraseña vive solo en .mongo-admin-credenciales.txt, que está en .gitignore.'],
      ['sst_app', 'La aplicación en producción (SST_MONGO_URI).', 'readWrite solo sobre la base sst_kotoduo.', 'dropDatabase; tocar cualquier base distinta de sst_kotoduo (verificado: ver 4.3).'],
      ['sst_pruebas', 'La suite automática de pruebas (SST_MONGO_PRUEBAS_URI).', 'readWriteAnyDatabase + dbAdminAnyDatabase sobre admin: crea, usa y borra sus propias bases temporales.', 'El rol dbAdminAnyDatabase es imprescindible aparte de readWriteAnyDatabase: sin él, dropDatabase() falla (fue el defecto DEF-03, documentado en evidencias/defectos.md).'],
    ],
    [16, 22, 34, 28],
  ),
  espacio(),
  h2('4.3 La prueba que lo demuestra'),
  p('Salida real de "npm run verificar" (evidencias/verificacion_entorno.txt): el script intenta activamente las operaciones prohibidas y confirma que fallan, no se limita a describirlas:'),
  pre([
    '[ OK ] PostgreSQL: conexión con sst_app — PostgreSQL 16.14',
    '[ OK ] PostgreSQL: sst_app NO puede CREATE TABLE (mínimo privilegio)',
    '[ OK ] PostgreSQL: sst_app NO puede DROP TABLE (mínimo privilegio)',
    '[ OK ] PostgreSQL: escritura y lectura con sst_app (registro DEMO)',
    '[ OK ] PostgreSQL: limpieza del registro DEMO (con sst_propietario)',
    '[ OK ] MongoDB: conexión con sst_app',
    '[ OK ] MongoDB: sst_app NO puede dropDatabase (mínimo privilegio)',
    '[ OK ] MongoDB: escritura y lectura con sst_app (documento DEMO)',
    '[ OK ] MongoDB: limpieza del documento DEMO',
    '=== Resumen === 12 de 12 verificaciones en OK.',
  ]),
  nota('este mínimo privilegio de MongoDB se comprueba hoy SOLO en local (al ejecutar "npm run '
    + 'verificar" a mano), no en el flujo de GitHub Actions: el Mongo que usa la integración '
    + 'continua corre sin autenticación, así que ahí ningún rol se aplica de verdad todavía. Está '
    + 'documentado, sin maquillarlo, como DEF-06 en evidencias/defectos.md, con la forma más simple '
    + 'propuesta para corregirlo.'),

  // 5 ----------------------------------------------------------------------------------------
  h1('5. Dónde está cada credencial'),
  p('Ninguna contraseña real aparece en este documento ni en ningún archivo del repositorio: se usa <CLAVE> como marcador en todos los casos.'),
  tabla(
    ['Credencial', 'Archivo', 'Variable / ubicación', 'Quién la usa'],
    [
      ['Rol sst_app (PostgreSQL)', '.env', 'SST_PG_URL', 'La aplicación (src/servidor.js), los scripts de demostración'],
      ['Rol sst_propietario (PostgreSQL)', '.env', 'SST_PG_PROPIETARIO_URL', 'scripts/db/crear-base-postgres.js'],
      ['Rol sst_pruebas (PostgreSQL)', '.env', 'SST_PG_PRUEBAS_URL', 'tests/contexto.js, tests/integracion/baseRelacional.test.js, rendimiento/indices.js'],
      ['Rol sst_app (MongoDB)', '.env', 'SST_MONGO_URI (y SST_MONGO_BASE para el nombre de la base)', 'La aplicación, los scripts de demostración'],
      ['Rol sst_pruebas (MongoDB)', '.env', 'SST_MONGO_PRUEBAS_URI', 'tests/contexto.js'],
      ['Rol sst_admin (MongoDB)', '.mongo-admin-credenciales.txt (NO está en el repositorio: en .gitignore)', 'URI completa dentro del archivo', 'Quien use MongoDB Compass o mongosh'],
      ['Superusuario postgres', 'Ninguno', 'No se guarda en ningún archivo del proyecto; se escribe una sola vez, de forma oculta, al correr "npm run db:crear" (o por la variable temporal PGPASSWORD, si se usa así)', 'Quien ejecuta la preparación inicial del entorno'],
      ['Firma de los tokens de sesión', '.env', 'SST_JWT_SECRETO', 'La aplicación (src/config/entorno.js exige 32 caracteres o más)'],
    ],
    [22, 24, 32, 22],
  ),

  // 6 ----------------------------------------------------------------------------------------
  h1('6. Cómo demostrarlo en vivo en 2 minutos'),
  bullet('Antes (preparado con anticipación, no durante los 2 minutos): "npm run demo:sembrar" y "npm run demo" ya corriendo; pgAdmin ya conectado a sst_kotoduo con sst_app; Compass ya conectado con sst_admin.'),
  bullet('(0:00–0:30) En el navegador, http://localhost:3000: inicia sesión con una cuenta de .demo-credenciales.txt (por ejemplo jorge, Vendedor) y crea o abre una solicitud; anota el código KT-….'),
  bullet('(0:30–1:00) En pgAdmin, Query Tool sobre sst_kotoduo: ejecuta la consulta "Trabajos con su etapa vigente" (sección 2.8) filtrando por ese código, para mostrar que la acción de la pantalla quedó de verdad en la base relacional.'),
  bullet('(1:00–1:30) En Compass, colección bitacora_eventos: filtra por {"entidad.codigo": "KT-…"} y muestra el evento recién generado (por ejemplo TRABAJO_CREADO) con su fecha, para mostrar que también quedó en la base documental.'),
  bullet('(1:30–2:00) Cierre: nombra que ambas conexiones usan roles de mínimo privilegio distintos (sst_app no puede crear ni borrar tablas, ni borrar bases de Mongo), citando el resultado de "npm run verificar" sin leer ninguna contraseña en voz alta.'),

  // 7 ----------------------------------------------------------------------------------------
  h1('7. Si algo falla'),
  tabla(
    ['Síntoma', 'Causa típica', 'Solución'],
    [
      ['ECONNREFUSED 127.0.0.1:5432', 'El servicio "postgresql-x64-16" está detenido, o SST_PG_URL apunta a otro puerto.', 'Revisar en Servicios de Windows que esté "En ejecución"; confirmar que la URL usa el puerto 5432.'],
      ['pgAdmin conecta pero no aparece sst_kotoduo ni sus tablas', 'Se conectó por error al servidor de PostgreSQL 18 (puerto 5433), instalado aparte en este equipo.', 'Revisar el puerto del servidor registrado en pgAdmin: debe ser 5432.'],
      ['"password authentication failed for user …"', 'Se copió mal la contraseña, o se está usando la de otro rol.', 'Revisar que la URL completa de .env corresponda exactamente al rol que se quiere usar.'],
      ['MongoDB Compass: "Authentication failed"', 'Falta ?authSource=admin en la URI, o no corresponde a la base donde se creó ese usuario.', 'sst_admin y sst_pruebas usan authSource=admin; sst_app usa authSource=sst_kotoduo (cada uno se creó en una base distinta, ver scripts/db/mongo-crear-usuarios.js).'],
      ['Compass conecta pero sst_kotoduo aparece vacía o con datos desconocidos', 'Se conectó al servicio "MongoDB" genérico de Windows (puerto 27017), no al mongod propio del proyecto.', 'Usar siempre el puerto 27027 en la URI para este proyecto.'],
      ['"npm run pruebas" falla con "Falta SST_PG_PRUEBAS_URL en .env"', 'No se ejecutó "npm run db:crear" antes, o la terminal no está cargando el archivo .env de la raíz del proyecto.', 'Ejecutar "npm run db:crear" y "npm run mongo:iniciar" primero; confirmar que existe un .env en la raíz.'],
      ['"npm run db:crear" dice que un rol "ya existía… no encontré la variable en .env"', 'El rol de PostgreSQL ya estaba creado de una ejecución anterior, pero .env se borró, se movió o se regeneró.', 'Seguir la instrucción que imprime el propio script: borrar ese rol a mano (DROP ROLE nombre;) conectado como superusuario, y volver a ejecutar.'],
    ],
    [26, 37, 37],
  ),

  // 8 ----------------------------------------------------------------------------------------
  h1('8. 15 preguntas que podrían hacer, con respuesta corta'),
  ...[
    ['¿Por qué el sistema usa dos motores de base de datos en vez de uno solo?',
      'Porque los datos tienen dos naturalezas distintas: datos transaccionales de forma fija con restricciones de integridad fuertes (PostgreSQL), y documentos de forma variable más un registro de auditoría de solo inserción (MongoDB). Ver el mapa de la sección 1.'],
    ['¿Qué información vive en PostgreSQL y cuál en MongoDB?',
      'En PostgreSQL: usuarios, sesiones, trabajos, etapas, diseños (solo su versión/estado) y aprobaciones. En MongoDB: el contenido de cada propuesta de diseño (archivos, especificaciones, comentarios) y la bitácora de eventos.'],
    ['¿Cómo se conecta un diseño guardado en MongoDB con su fila en PostgreSQL?',
      'La columna diseno.ref_documento guarda, como texto hexadecimal, el mismo ObjectId que es el _id del documento en la colección propuestas_diseno. Ejemplo real y pasos en la sección 3.5.'],
    ['¿Qué pasa si la escritura en MongoDB falla justo después de guardar en PostgreSQL?',
      'servicioDisenos.js borra el documento de Mongo si llegó a crearse a medias y relanza el error. No es una transacción distribuida real (no hay two-phase-commit entre los dos motores): es un orden deliberado con limpieza manual si el segundo paso falla.'],
    ['¿Cuántas tablas tiene el esquema relacional y cuántas colecciones la base documental?',
      '12 tablas en PostgreSQL (sección 2.4) y 2 colecciones en MongoDB (sección 3.4): propuestas_diseno y bitacora_eventos.'],
    ['¿Por qué casi todas las llaves foráneas son RESTRICT y no CASCADE?',
      'Para no perder historial por accidente: el código nunca borra usuarios ni trabajos, solo los desactiva o les cambia el estado. Las únicas CASCADE (sesion→usuario, trabajo_material→trabajo) son casos donde el dato realmente no tiene sentido sin su "dueño".'],
    ['¿Qué índices existen en PostgreSQL y mejoraron todos de forma medible?',
      'Hay 5 índices (sección 2.6). No todos mejoraron: la consulta del Panel general salió más lenta con su índice puesto que sin él en la medición con 5000 filas (-30.9 %), y eso se dejó documentado tal cual, sin maquillarlo.'],
    ['¿Cuántos roles tiene cada motor y para qué sirve cada uno?',
      'PostgreSQL: postgres (superusuario, solo instalación), sst_propietario (dueño del esquema), sst_app (aplicación) y sst_pruebas (pruebas automáticas). MongoDB: sst_admin (inspección), sst_app (aplicación) y sst_pruebas (pruebas automáticas). Detalle en la sección 4.'],
    ['¿Qué NO puede hacer el rol que usa la aplicación en producción (sst_app), y cómo se demuestra?',
      'No puede borrar filas en ninguna tabla, ni crear o borrar tablas en PostgreSQL, ni hacer dropDatabase en MongoDB. Se demuestra ejecutando esas operaciones de verdad y confirmando que fallan: ver la salida literal de "npm run verificar" en la sección 4.3.'],
    ['¿Por qué el rol de pruebas (sst_pruebas) necesita un permiso adicional (dbAdminAnyDatabase) que sst_app no tiene?',
      'Porque sst_pruebas necesita poder borrar (dropDatabase) las bases temporales que crea para cada ejecución de la suite, y en MongoDB esa operación pertenece al grupo de roles de administración (dbAdmin), no al de lectura/escritura (readWrite). Sin ese rol, dropDatabase falla (fue el defecto DEF-03).'],
    ['¿Qué es la "excepción de localhost" de MongoDB y qué problema real causó durante la preparación del entorno?',
      'Es un permiso especial de MongoDB que permite, mientras no exista ningún usuario, una conexión sin autenticar desde la misma máquina, solo para crear el primer usuario. Causó dos defectos reales (DEF-01 y DEF-02, en evidencias/defectos.md): un falso positivo al detectar si ya había usuarios, y que crear varios usuarios seguidos fallaba a la mitad porque esa excepción solo alcanza para una operación.'],
    ['¿El mínimo privilegio de MongoDB se comprueba automáticamente en cada entrega a GitHub (CI)? ¿Por qué sí o por qué no?',
      'No todavía. El Mongo que usa el flujo de integración continua corre sin autenticación, así que ningún rol se aplica de verdad ahí. Está documentado como DEF-06, con la forma más simple propuesta para corregirlo (sección 4.3).'],
    ['¿Qué pasaría si alguien borra la carpeta de datos de MongoDB o detiene el servicio de PostgreSQL 16?',
      'Se pierde todo lo guardado en ese motor: no hay un respaldo automático configurado todavía (limitación conocida, anotada en esta guía). Para MongoDB habría que volver a ejecutar "npm run mongo:iniciar" y "npm run demo:sembrar"; para PostgreSQL, reiniciar el servicio de Windows y, si la carpeta de datos se perdió, volver a ejecutar "npm run db:crear".'],
    ['¿Qué validaciones de integridad existen más allá de las llaves foráneas?',
      'En PostgreSQL: restricciones CHECK (por ejemplo, cantidad > 0, estados dentro de una lista fija, motivo obligatorio si se rechaza un diseño) y UNIQUE (correo, código de trabajo). En MongoDB: un validador $jsonSchema en propuestas_diseno que rechaza documentos con forma inválida (sección 3.4), aunque no reemplaza ninguna llave foránea porque MongoDB no las tiene.'],
    ['¿Cómo escalaría este diseño si Kotoduo abriera una segunda planta con más usuarios simultáneos?',
      'No se ha probado a esa escala: es una pregunta abierta. Lo primero que habría que medir es la contención en las consultas de "mis actividades" por área bajo carga concurrente real (hoy solo hay una prueba de carga con autocannon, CP-33, sobre un solo proceso) y si el pool de conexiones de PostgreSQL (máximo 10 en src/db/postgres.js) alcanza; MongoDB, al ser de solo inserción en la bitácora y lecturas simples en propuestas, debería escalar sin cambios inmediatos, pero eso tampoco está medido todavía.'],
  ].flatMap(([pregunta, respuesta], i) => [
    h3(`${i + 1}. ${pregunta}`),
    p(respuesta),
  ]),
];

const documento = new Document({
  creator: 'Equipo SST Kotoduo',
  title: 'Guía de bases de datos — SST Kotoduo',
  description: 'Guía paso a paso para estudiar y demostrar las bases de datos del proyecto SST Kotoduo.',
  sections: [{ children: contenido }],
});

Packer.toBuffer(documento).then((buffer) => {
  fs.mkdirSync(path.dirname(RUTA_SALIDA), { recursive: true });
  fs.writeFileSync(RUTA_SALIDA, buffer);
  console.log(`Listo: ${path.relative(path.join(__dirname, '..'), RUTA_SALIDA)}`);
});

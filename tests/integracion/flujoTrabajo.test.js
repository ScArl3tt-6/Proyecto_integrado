'use strict';
const { crearContexto, CABECERAS, fechaEnDias } = require('../contexto');

describe('Pruebas de integración - flujo completo de un trabajo de bordado', () => {
  let ctx; let jorge; let valentina; let marcela; let luis; let koto;
  let codigo; let idDisenoV1; let idDisenoV2;

  beforeAll(async () => {
    ctx = await crearContexto();
    [jorge, valentina, marcela, luis, koto] = await Promise.all(
      ['jorge', 'valentina', 'marcela', 'luis', 'koto'].map((u) => ctx.iniciarSesion(u)),
    );
  });
  afterAll(async () => ctx.cerrar());

  const propuesta = (version) => ({
    archivos: [{ nombre: `poleras_club_v${version}.pdf`, tipoMime: 'application/pdf', tamanoBytes: 482133, cabeceraBase64: CABECERAS.pdf }],
    especificaciones: { tecnica: 'Bordado', ubicacion: 'Pecho izquierdo', medidas: '9 x 7 cm', colores: ['Azul marino', 'Blanco'] },
    comentario: `Versión ${version} del logo`,
  });

  test('CP-08 (HU-01) el vendedor registra una solicitud y queda en estado SOLICITADO', async () => {
    const res = await jorge.post('/api/trabajos', {
      idTipo: 1, descripcion: '40 poleras piqué bordadas para club deportivo', cantidad: 40, fechaCompromiso: fechaEnDias(10),
    });
    expect(res.status).toBe(201);
    expect(res.body.codigo).toMatch(/^KT-\d{4}-0001$/);
    expect(res.body.estado).toBe('SOLICITADO');
    codigo = res.body.codigo;
  });

  test('CP-09 (HU-02) diseño envía la propuesta: versión en PostgreSQL y documento en MongoDB', async () => {
    expect((await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`)).body.estado).toBe('EN_DISENO');
    const res = await valentina.post(`/api/disenos/trabajos/${codigo}`, propuesta(1));
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(1);
    idDisenoV1 = res.body.idDiseno;

    const { rows } = await ctx.pg.query('SELECT estado FROM trabajo WHERE codigo = $1', [codigo]);
    expect(rows[0].estado).toBe('PENDIENTE_APROBACION');
    const doc = await ctx.mongoDb.collection('propuestas_diseno').findOne({ trabajoCodigo: codigo, version: 1 });
    expect(doc.idDiseno).toBe(idDisenoV1);
    expect(doc.archivos[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('CP-10 (HU-03) producción rechaza con motivo y luego aprueba la versión 2', async () => {
    const sinMotivo = await marcela.post(`/api/disenos/${idDisenoV1}/decision`, { decision: 'RECHAZADO' });
    expect(sinMotivo.status).toBe(400);

    const rechazo = await marcela.post(`/api/disenos/${idDisenoV1}/decision`, { decision: 'RECHAZADO', motivo: 'El logo supera el ancho permitido para el pecho' });
    expect(rechazo.body.estadoTrabajo).toBe('EN_DISENO');

    const v2 = await valentina.post(`/api/disenos/trabajos/${codigo}`, propuesta(2));
    expect(v2.body.version).toBe(2);
    idDisenoV2 = v2.body.idDiseno;

    const aprobacion = await marcela.post(`/api/disenos/${idDisenoV2}/decision`, { decision: 'APROBADO' });
    expect(aprobacion.status).toBe(200);
    expect(aprobacion.body.estadoTrabajo).toBe('EN_PRODUCCION');

    const { rows } = await ctx.pg.query(
      `SELECT a.decision, u.correo, a.decidido_en FROM aprobacion_diseno a JOIN usuario u ON u.id_usuario = a.id_aprobador
        WHERE a.id_diseno = $1`, [idDisenoV2]);
    expect(rows[0]).toMatchObject({ decision: 'APROBADO', correo: 'marcela@kotoduo.test' });
    expect(rows[0].decidido_en).toBeTruthy();

    const repetida = await marcela.post(`/api/disenos/${idDisenoV2}/decision`, { decision: 'APROBADO' });
    expect(repetida.status).toBe(409);
  });

  test('CP-11 (HU-04) el operario de Bordado ve la actividad vigente y la siguiente', async () => {
    const res = await luis.get('/api/trabajos/mis-actividades');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      codigo, etapa_actual: 'Preparación de matriz de bordado', siguiente_actividad: 'Bordado de prendas', atrasado: false,
    });
  });

  test('CP-12 (HU-05) completar las etapas actualiza el estado hasta TERMINADO', async () => {
    const e1 = await luis.post(`/api/trabajos/${codigo}/etapas/1/completar`);
    expect(e1.body).toMatchObject({ siguienteOrden: 2, estadoTrabajo: 'EN_PRODUCCION' });
    const fueraDeOrden = await luis.post(`/api/trabajos/${codigo}/etapas/3/completar`);
    expect(fueraDeOrden.status).toBe(409);
    await luis.post(`/api/trabajos/${codigo}/etapas/2/completar`);
    const e3 = await luis.post(`/api/trabajos/${codigo}/etapas/3/completar`);
    expect(e3.body).toMatchObject({ siguienteOrden: null, estadoTrabajo: 'TERMINADO' });

    const { rows } = await ctx.pg.query(
      `SELECT COUNT(*)::int AS n FROM etapa_trabajo et JOIN trabajo t ON t.id_trabajo = et.id_trabajo
        WHERE t.codigo = $1 AND et.estado = 'COMPLETADA' AND et.id_responsable IS NOT NULL AND et.termino IS NOT NULL`, [codigo]);
    expect(rows[0].n).toBe(3);
  });

  test('CP-13 (HU-06) el panel agrupa los trabajos por estado e identifica atrasos', async () => {
    await jorge.post('/api/trabajos', { idTipo: 2, descripcion: 'Tazones sublimados aniversario municipal', cantidad: 120, fechaCompromiso: fechaEnDias(-2) });
    await jorge.post('/api/trabajos', { idTipo: 3, descripcion: 'Letrero fachada sucursal centro', cantidad: 1, fechaCompromiso: fechaEnDias(15) });
    const res = await koto.get('/api/panel');
    expect(res.status).toBe(200);
    expect(res.body.totales).toEqual({ EN_CURSO: 1, ATRASADO: 1, DETENIDO: 0, TERMINADO: 1 });
    expect(res.body.grupos.EN_CURSO[0]).toHaveProperty('area_responsable', 'Diseño');
  });

  test('CP-15 integración PostgreSQL-MongoDB: detalle del diseño y bitácora del trabajo', async () => {
    const detalle = await marcela.get(`/api/disenos/${idDisenoV2}`);
    expect(detalle.body).toMatchObject({ codigo, version: 2, estado: 'APROBADO' });
    expect(detalle.body.propuesta.especificaciones.ubicacion).toBe('Pecho izquierdo');

    const bitacora = await koto.get(`/api/auditoria/trabajos/${codigo}`);
    expect(bitacora.body.map((e) => e.tipo)).toEqual([
      'TRABAJO_CREADO', 'DISENO_INICIADO', 'DISENO_ENVIADO', 'DISENO_RECHAZADO', 'DISENO_ENVIADO',
      'DISENO_APROBADO', 'ETAPA_COMPLETADA', 'ETAPA_COMPLETADA', 'ETAPA_COMPLETADA',
    ]);
  });
});

describe('Pruebas de integración - perfiles y consistencia', () => {
  test('CP-14 (HU-07) el cambio de perfil revoca la sesión activa de inmediato', async () => {
    const ctx = await crearContexto();
    try {
      const jorge = await ctx.iniciarSesion('jorge');
      const koto = await ctx.iniciarSesion('koto');
      expect((await jorge.get('/api/auth/sesion')).body.rol).toBe('VENDEDOR');

      const cambio = await koto.patch(`/api/usuarios/${ctx.usuarios.jorge.idUsuario}/perfil`, { rol: 'OPERARIO', area: 'Letreros' });
      expect(cambio.status).toBe(200);
      expect((await jorge.get('/api/auth/sesion')).status).toBe(401);

      const nueva = await ctx.iniciarSesion('jorge');
      expect((await nueva.get('/api/auth/sesion')).body.rol).toBe('OPERARIO');
      expect((await nueva.post('/api/trabajos', { idTipo: 1, descripcion: 'Prueba de permisos', cantidad: 1, fechaCompromiso: fechaEnDias(3) })).status).toBe(403);
    } finally {
      await ctx.cerrar();
    }
  });

  test('CP-16 si MongoDB falla al guardar la propuesta, PostgreSQL revierte la transacción', async () => {
    const envolverMongo = (db) => ({
      collection: (nombre) => {
        const col = db.collection(nombre);
        if (nombre !== 'propuestas_diseno') return col;
        return new Proxy(col, { get: (t, p) => (p === 'insertOne' ? async () => { throw new Error('Falla simulada de MongoDB'); } : t[p]) });
      },
    });
    const ctx = await crearContexto({ envolverMongo });
    try {
      const jorge = await ctx.iniciarSesion('jorge');
      const valentina = await ctx.iniciarSesion('valentina');
      const { body: { codigo } } = await jorge.post('/api/trabajos', { idTipo: 4, descripcion: 'Placas grabadas premiación', cantidad: 25, fechaCompromiso: fechaEnDias(7) });
      await valentina.post(`/api/trabajos/${codigo}/tomar-diseno`);
      const res = await valentina.post(`/api/disenos/trabajos/${codigo}`, {
        archivos: [{ nombre: 'placa.png', tipoMime: 'image/png', tamanoBytes: 90000, cabeceraBase64: CABECERAS.png }],
      });
      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('idIncidente');
      const { rows } = await ctx.pg.query(
        'SELECT t.estado, (SELECT COUNT(*)::int FROM diseno d WHERE d.id_trabajo = t.id_trabajo) AS disenos FROM trabajo t WHERE codigo = $1', [codigo]);
      expect(rows[0]).toEqual({ estado: 'EN_DISENO', disenos: 0 });
    } finally {
      await ctx.cerrar();
    }
  });
});

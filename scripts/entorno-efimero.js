'use strict';
// Entorno de verificación aislado y desechable: crea su PROPIA base de PostgreSQL y su propia
// base de MongoDB (el mismo mecanismo que usa la suite de Jest: tests/contexto.js, con el rol
// sst_pruebas, que crea y destruye sus propias bases temporales), levanta un servidor HTTP real
// en un puerto aparte con seis trabajos de ejemplo, y lo destruye todo al terminar (Ctrl+C).
// Nunca toca "sst_kotoduo" (la base real de demostración): así verificar algo con un navegador
// real no deja ningún residuo ahí. No reemplaza "npm run demo": es solo para que la persona (o
// Claude) que verifica un cambio en el navegador lo haga sin ensuciar la base que usa el equipo.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { crearContexto, fechaEnDias } = require('../tests/contexto');

const PUERTO = Number(process.env.PUERTO_VERIFICACION || 3100);
// Solo para verificar a mano el cierre de sesión por inactividad sin esperar los minutos reales:
// SST_MINUTOS_INACTIVIDAD=0.2 node scripts/entorno-efimero.js (no cambia el valor real de producción).
const minutosInactividad = process.env.SST_MINUTOS_INACTIVIDAD ? Number(process.env.SST_MINUTOS_INACTIVIDAD) : undefined;

async function principal() {
  console.log('Creando un entorno de verificación aislado (base de datos propia, no la real)...');
  const ctx = await crearContexto(minutosInactividad !== undefined ? { entornoExtra: { minutosInactividad } } : undefined);

  const u = (clave) => ({ id: ctx.usuarios[clave].idUsuario, rol: ctx.usuarios[clave].rol });
  const jorge = u('jorge');
  const valentina = u('valentina');
  const marcela = u('marcela');
  const { rows: areas } = await ctx.pg.query('SELECT id_area, nombre FROM area');
  const idArea = (nombre) => areas.find((a) => a.nombre === nombre)?.id_area ?? null;
  const luis = { ...u('luis'), idArea: idArea('Bordado') };

  const archivo = (nombre) => ({ nombre, tipoMime: 'application/pdf', contenidoBase64: Buffer.from('%PDF-1.7\nContenido de ejemplo del entorno de verificación.').toString('base64') });
  async function aprobar(codigo) {
    await ctx.servicios.trabajos.tomarParaDiseno(valentina, codigo);
    const { idDiseno } = await ctx.servicios.disenos.enviarPropuesta(valentina, codigo, { archivos: [archivo(`${codigo}.pdf`)] });
    await ctx.servicios.disenos.decidir(marcela, idDiseno, { decision: 'APROBADO' });
  }

  const { codigo: atrasado } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Poleras bordadas para evento de aniversario', cantidad: 40, fechaCompromiso: fechaEnDias(-5),
  });
  const { codigo: pendiente } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 2, descripcion: 'Tazones sublimados para egreso de curso', cantidad: 80, fechaCompromiso: fechaEnDias(10),
  });
  await ctx.servicios.trabajos.tomarParaDiseno(valentina, pendiente);
  await ctx.servicios.disenos.enviarPropuesta(valentina, pendiente, { archivos: [archivo(`${pendiente}.pdf`)] });

  const { codigo: rechazado } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 3, descripcion: 'Letrero luminoso fachada local centro', cantidad: 1, fechaCompromiso: fechaEnDias(18),
  });
  await ctx.servicios.trabajos.tomarParaDiseno(valentina, rechazado);
  const { idDiseno: idDisenoRechazado } = await ctx.servicios.disenos.enviarPropuesta(valentina, rechazado, { archivos: [archivo(`${rechazado}.pdf`)] });
  await ctx.servicios.disenos.decidir(marcela, idDisenoRechazado, { decision: 'RECHAZADO', motivo: 'El tamaño del letrero supera el ancho permitido por la fachada' });

  const { codigo: detenido } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 4, descripcion: 'Placas grabadas para premiación regional', cantidad: 25, fechaCompromiso: fechaEnDias(14),
  });
  await aprobar(detenido);
  await ctx.servicios.trabajos.detener(marcela, detenido, 'Falta materia prima para el grabado');

  const { codigo: enProduccion } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Chalecos bordados para turno de planta', cantidad: 35, fechaCompromiso: fechaEnDias(9),
  });
  await aprobar(enProduccion);

  const { codigo: terminado } = await ctx.servicios.trabajos.registrarSolicitud(jorge, {
    idTipo: 1, descripcion: 'Poleras bordadas para taller interno', cantidad: 20, fechaCompromiso: fechaEnDias(-1),
  });
  await aprobar(terminado);
  await ctx.servicios.trabajos.completarEtapa(luis, terminado, 1);
  await ctx.servicios.trabajos.completarEtapa(luis, terminado, 2);
  await ctx.servicios.trabajos.completarEtapa(luis, terminado, 3);

  const rutaCredenciales = path.join(os.tmpdir(), `sst-kotoduo-entorno-efimero-${process.pid}.txt`);
  fs.writeFileSync(rutaCredenciales, [
    'Entorno de verificación aislado y desechable (no es la base real de demostración).',
    ...Object.entries(ctx.usuarios).map(([clave, c]) => `${clave.padEnd(10)} ${c.rol.padEnd(14)} ${c.correo.padEnd(24)} ${c.contrasena}`),
    '',
    `Trabajos: ${atrasado} (atrasado), ${pendiente} (pendiente de aprobación), ${rechazado} (rechazado con motivo),`,
    `          ${detenido} (detenido), ${enProduccion} (en producción, Bordado), ${terminado} (terminado).`,
  ].join('\n'), 'utf8');

  const rutaSenal = `${rutaCredenciales}.cerrar`;
  const servidor = ctx.app.listen(PUERTO, () => {
    console.log(`Entorno de verificación listo en http://localhost:${PUERTO}`);
    console.log(`Credenciales y códigos de ejemplo en: ${rutaCredenciales}`);
    console.log('Presiona Ctrl+C para cerrar y destruir esta base (no afecta la base real).');
    console.log(`(En segundo plano, sin una terminal interactiva: crea el archivo "${rutaSenal}" para pedir el cierre.)`);
  });

  let cerrando = false;
  const cerrar = async () => {
    if (cerrando) return;
    cerrando = true;
    clearInterval(vigilancia);
    console.log('\nCerrando y destruyendo el entorno de verificación...');
    await new Promise((resolve) => servidor.close(resolve));
    await ctx.cerrar();
    fs.rmSync(rutaCredenciales, { force: true });
    fs.rmSync(rutaSenal, { force: true });
    console.log('Listo. No quedó ningún dato en la base real.');
    process.exit(0);
  };
  // Ctrl+C (SIGINT) funciona en una terminal interactiva normal. Como respaldo, por ejemplo si
  // este proceso se lanzó en segundo plano y una señal del sistema operativo no le llega (pasó de
  // verdad al probarlo en Windows), también se puede pedir el cierre creando un archivo señal.
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
  const vigilancia = setInterval(() => { if (fs.existsSync(rutaSenal)) cerrar(); }, 1000);
}

principal().catch((err) => {
  console.error('No fue posible crear el entorno de verificación:', err.message);
  process.exit(1);
});

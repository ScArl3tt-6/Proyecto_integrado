'use strict';
const { puedeTransitar, validarTransicion, etapaVigente, siguienteEtapa, estaAtrasado } = require('../../src/dominio/flujoTrabajo');
const { validarContrasena } = require('../../src/dominio/politicaContrasena');
const { tienePermiso } = require('../../src/dominio/permisos');
const { validarArchivoDiseno } = require('../../src/dominio/archivosDiseno');
const { CABECERAS } = require('../contexto');

describe('Pruebas unitarias - flujo del trabajo', () => {
  test('CP-01 permite las transiciones definidas en el flujo', () => {
    expect(puedeTransitar('SOLICITADO', 'EN_DISENO')).toBe(true);
    expect(puedeTransitar('EN_DISENO', 'PENDIENTE_APROBACION')).toBe(true);
    expect(puedeTransitar('PENDIENTE_APROBACION', 'EN_PRODUCCION')).toBe(true);
    expect(puedeTransitar('PENDIENTE_APROBACION', 'EN_DISENO')).toBe(true);
    expect(puedeTransitar('DETENIDO', 'EN_PRODUCCION')).toBe(true);
  });

  test('CP-02 impide pasar a producción sin aprobación de diseño', () => {
    expect(() => validarTransicion('SOLICITADO', 'EN_PRODUCCION')).toThrow(/no permitida/);
    expect(() => validarTransicion('EN_DISENO', 'EN_PRODUCCION')).toThrow(/no permitida/);
    expect(() => validarTransicion('TERMINADO', 'EN_PRODUCCION')).toThrow(/no permitida/);
    expect(puedeTransitar('ESTADO_INEXISTENTE', 'TERMINADO')).toBe(false);
  });

  test('CP-03 identifica la etapa vigente y la siguiente actividad', () => {
    const etapas = [
      { orden: 2, estado: 'PENDIENTE' }, { orden: 1, estado: 'COMPLETADA' }, { orden: 3, estado: 'PENDIENTE' },
    ];
    expect(etapaVigente(etapas).orden).toBe(2);
    expect(siguienteEtapa(etapas, 2).orden).toBe(3);
    expect(siguienteEtapa(etapas, 3)).toBeNull();
    expect(etapaVigente(etapas.map((e) => ({ ...e, estado: 'COMPLETADA' })))).toBeNull();
  });

  test('CP-04 calcula atraso según fecha comprometida y no marca trabajos terminados', () => {
    const hoy = new Date('2026-10-20T10:00:00');
    expect(estaAtrasado({ estado: 'EN_PRODUCCION', fecha_compromiso: '2026-10-19' }, hoy)).toBe(true);
    expect(estaAtrasado({ estado: 'EN_PRODUCCION', fecha_compromiso: '2026-10-20' }, hoy)).toBe(false);
    expect(estaAtrasado({ estado: 'TERMINADO', fecha_compromiso: '2026-10-01' }, hoy)).toBe(false);
  });
});

describe('Pruebas unitarias - seguridad del dominio', () => {
  test('CP-05 aplica la política de contraseñas', () => {
    expect(validarContrasena('corta1!', {}).valida).toBe(false);
    expect(validarContrasena('kotoduo2026!', {}).valida).toBe(false);
    expect(validarContrasena('marcela-bordado-2026', { correo: 'marcela@kotoduo.test' }).valida).toBe(false);
    expect(validarContrasena('aaaaaaaaaaaa', {}).valida).toBe(false);
    expect(validarContrasena('abcabcabcabc', {}).valida).toBe(false);
    expect(validarContrasena('0123456789', {}).valida).toBe(false);
    expect(validarContrasena('Mi clave de Kotoduo 2026', {}).valida).toBe(false);
    expect(validarContrasena('hilo azul sobre polera roja', { correo: 'luis@kotoduo.test', nombre: 'Luis Cárdenas' }).valida).toBe(true);
  });

  test('CP-06 la matriz RBAC deniega por defecto y separa funciones', () => {
    expect(tienePermiso('PRODUCCION', 'DISENO_APROBAR')).toBe(true);
    expect(tienePermiso('ADMINISTRADOR', 'DISENO_APROBAR')).toBe(false);
    expect(tienePermiso('OPERARIO', 'TRABAJO_CREAR')).toBe(false);
    expect(tienePermiso('VENDEDOR', 'PANEL_VER')).toBe(false);
    expect(tienePermiso('ROL_INVENTADO', 'PANEL_VER')).toBe(false);
  });

  test('CP-07 valida tipo, extensión, tamaño y firma de los archivos de diseño', () => {
    const base = { nombre: 'polera_club.pdf', tipoMime: 'application/pdf', tamanoBytes: 250000, cabeceraBase64: CABECERAS.pdf };
    expect(validarArchivoDiseno(base).valido).toBe(true);
    expect(validarArchivoDiseno({ ...base, nombre: 'logo.svg', tipoMime: 'image/svg+xml', cabeceraBase64: CABECERAS.svg }).valido).toBe(false);
    expect(validarArchivoDiseno({ ...base, cabeceraBase64: CABECERAS.png }).errores).toContain('El contenido no corresponde al tipo declarado');
    expect(validarArchivoDiseno({ ...base, nombre: '../../etc/passwd.pdf' }).valido).toBe(false);
    expect(validarArchivoDiseno({ ...base, tamanoBytes: 16 * 1024 * 1024 }).valido).toBe(false);
  });
});

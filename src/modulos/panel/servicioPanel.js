'use strict';
const { estaAtrasado } = require('../../dominio/flujoTrabajo');

// HU-06 / RF-06: panel general agrupado por estado, con área responsable y días en la etapa actual
function crearServicioPanel({ pg }) {
  async function resumen(hoy = new Date()) {
    const { rows } = await pg.query(
      `SELECT t.codigo, tt.nombre AS tipo, t.estado, t.fecha_compromiso,
              COALESCE(a.nombre, CASE WHEN t.estado IN ('SOLICITADO','EN_DISENO') THEN 'Diseño'
                                      WHEN t.estado = 'PENDIENTE_APROBACION' THEN 'Producción (aprobación)' END) AS area_responsable,
              DATE_PART('day', now() - COALESCE(et.inicio, t.actualizado_en))::int AS dias_en_etapa
         FROM trabajo t
         JOIN tipo_trabajo tt ON tt.id_tipo = t.id_tipo
         LEFT JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo AND et.estado = 'EN_CURSO'
         LEFT JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
         LEFT JOIN area a ON a.id_area = ep.id_area
        ORDER BY t.fecha_compromiso ASC`,
    );
    const trabajos = rows.map((r) => ({ ...r, atrasado: estaAtrasado(r, hoy) }));
    const grupos = { EN_CURSO: [], ATRASADO: [], DETENIDO: [], TERMINADO: [] };
    for (const t of trabajos) {
      if (t.estado === 'TERMINADO') grupos.TERMINADO.push(t);
      else if (t.estado === 'DETENIDO') grupos.DETENIDO.push(t);
      else if (t.atrasado) grupos.ATRASADO.push(t);
      else grupos.EN_CURSO.push(t);
    }
    const totales = Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, v.length]));
    return { totales, grupos };
  }
  return { resumen };
}

module.exports = { crearServicioPanel };

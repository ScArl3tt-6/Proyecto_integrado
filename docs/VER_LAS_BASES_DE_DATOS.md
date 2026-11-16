# Cómo ver las bases de datos de SST Kotoduo

Esto es para inspeccionar los datos "por fuera" de la aplicación, con las herramientas gráficas
de cada motor. No hace falta para que el sistema funcione; es solo para la demostración o para
revisar algo a mano. Las contraseñas de ejemplo de este documento son ficticias: usa las que
generaron `npm run db:crear` y `npm run mongo:iniciar` en tu propio `.env`.

## PostgreSQL con pgAdmin 4

1. Abre pgAdmin 4. Clic derecho en **Servers** → **Register** → **Server...**.
2. Pestaña **General**: en "Name" pon `SST Kotoduo (local)`.
3. Pestaña **Connection**:
   - Host: `127.0.0.1`
   - Port: `5432`
   - Maintenance database: `postgres`
   - Username: `postgres` (el superusuario de tu instalación; pgAdmin te pedirá su contraseña)
4. Guarda. Dentro del servidor, abre **Databases → sst_kotoduo → Schemas → public → Tables** para
   ver las 12 tablas.

Para ver los datos **como los ve la aplicación** (con el rol de mínimo privilegio, no como
superusuario), registra un segundo servidor igual pero con:
   - Username: `sst_app`
   - Contraseña: la que quedó en `SST_PG_URL` dentro de tu `.env` (es la parte entre `sst_app:` y
     `@127.0.0.1`).

Con esa conexión puedes comprobar en los propios permisos de pgAdmin (botón derecho sobre una
tabla → **Properties** → pestaña **Security**) que `sst_app` no tiene `TRUNCATE` ni `TRIGGER`, y
que un intento de `CREATE TABLE` o `DROP TABLE` en el **Query Tool** falla con "permission denied".

### Consultas de ejemplo (Query Tool)

```sql
-- Trabajos con su etapa vigente y quién la tiene a cargo
SELECT t.codigo, t.estado, et.orden, ep.nombre AS etapa, et.estado AS estado_etapa, u.nombre AS responsable
  FROM trabajo t
  JOIN etapa_trabajo et ON et.id_trabajo = t.id_trabajo
  JOIN etapa_plantilla ep ON ep.id_etapa_plantilla = et.id_etapa_plantilla
  LEFT JOIN usuario u ON u.id_usuario = et.id_responsable
 ORDER BY t.codigo, et.orden;

-- Historial de aprobaciones de diseño, con quién decidió y cuándo
SELECT t.codigo, d.version, a.decision, a.motivo, u.nombre AS aprobador, a.decidido_en
  FROM aprobacion_diseno a
  JOIN diseno d ON d.id_diseno = a.id_diseno
  JOIN trabajo t ON t.id_trabajo = d.id_trabajo
  JOIN usuario u ON u.id_usuario = a.id_aprobador
 ORDER BY a.decidido_en DESC;

-- Trabajos atrasados (no es una columna: se calcula por fecha, igual que en la aplicación)
SELECT codigo, estado, fecha_compromiso
  FROM trabajo
 WHERE estado <> 'TERMINADO' AND fecha_compromiso < CURRENT_DATE;
```

## MongoDB con MongoDB Compass

1. Abre MongoDB Compass → **Add new connection**.
2. Pega esta URI, reemplazando `CLAVE` por la contraseña de `sst_admin` que guardó
   `npm run mongo:iniciar` en `.mongo-admin-credenciales.txt` (nunca la del archivo `.env`, esa es
   de `sst_app` y solo alcanza para `sst_kotoduo`):

   ```
   mongodb://sst_admin:CLAVE@127.0.0.1:27027/admin?authSource=admin
   ```
3. Conecta. En el panel izquierdo verás la base `sst_kotoduo` con dos colecciones:
   `propuestas_diseno` y `bitacora_eventos`.

### Consultas de ejemplo (pestaña "Filter" o "MONGOSH")

```js
// Una propuesta de diseño completa, con sus archivos y especificaciones
db.propuestas_diseno.find({ trabajoCodigo: "KT-2026-0001" })

// Todos los eventos de un trabajo, en orden
db.bitacora_eventos.find({ "entidad.codigo": "KT-2026-0001" }).sort({ fecha: 1 })

// Cuántos eventos hay de cada tipo (para ver qué se usa más)
db.bitacora_eventos.aggregate([
  { $group: { _id: "$tipo", total: { $sum: 1 } } },
  { $sort: { total: -1 } },
])

// Confirmar que el validador de esquema existe (debe fallar si se intenta insertar un SVG)
db.propuestas_diseno.insertOne({
  trabajoCodigo: "KT-9999-0000", idDiseno: 1, version: 1, creadoEn: new Date(),
  archivos: [{ nombre: "logo.svg", tipoMime: "image/svg+xml", tamanoBytes: 10, sha256: "a".repeat(64) }],
})
```

Con la conexión de `sst_admin` también puedes ir a **Databases** y confirmar que no hay ninguna
otra base de la aplicación aparte de `sst_kotoduo` (las bases `sst_prueba_xxxx` solo existen
mientras corre la suite automática de pruebas; se borran solas al terminar).

## Variables que hacen falta (ver `.env.example`)

| Variable | Para qué sirve | Quién la usa |
|---|---|---|
| `SST_PG_URL` | Conexión de la aplicación (rol `sst_app`, privilegio mínimo) | `src/servidor.js`, los scripts de demostración |
| `SST_PG_PROPIETARIO_URL` | Conexión para aplicar o revisar el esquema (rol `sst_propietario`) | `scripts/db/crear-base-postgres.js` |
| `SST_PG_PRUEBAS_URL` | Crear y borrar una base temporal por cada ejecución de pruebas (rol `sst_pruebas`, con `CREATEDB`) | `tests/contexto.js` |
| `SST_MONGO_URI` | Conexión de la aplicación (rol `sst_app`, `readWrite` solo sobre `sst_kotoduo`) | `src/servidor.js`, los scripts de demostración |
| `SST_MONGO_PRUEBAS_URI` | Crear, usar y borrar una base temporal por cada ejecución de pruebas (rol `sst_pruebas`) | `tests/contexto.js` |

Ninguna de estas variables usa la contraseña del superusuario `postgres` ni la de `sst_admin` de
MongoDB: esas dos solo las conoce quien ejecutó `npm run db:crear` / `npm run mongo:iniciar`, y no
quedan guardadas en ningún archivo del proyecto (la de `sst_admin` sí queda en
`.mongo-admin-credenciales.txt`, que está en `.gitignore`, para poder usar Compass).

'use strict';
const { cargarEntorno } = require('./config/entorno');
const { crearBaseRelacional } = require('./db/postgres');
const { crearBaseDocumental } = require('./db/mongo');
const { crearApp } = require('./app');

async function iniciar() {
  const entorno = cargarEntorno();
  const pg = await crearBaseRelacional(entorno.pgDirectorio);
  const { db: mongoDb } = await crearBaseDocumental(entorno.mongoUri, entorno.mongoBase);
  const { app } = crearApp({ entorno, pg, mongoDb });
  app.listen(entorno.puerto, () => console.log(`SST Kotoduo API escuchando en el puerto ${entorno.puerto}`));
}

iniciar().catch((err) => {
  console.error('No fue posible iniciar el servicio:', err.message);
  process.exit(1);
});

'use strict';
const express = require('express');

function rutasCatalogos({ catalogos }) {
  const r = express.Router();

  r.get('/', async (req, res) => {
    res.json(await catalogos.obtener());
  });

  return r;
}

module.exports = { rutasCatalogos };

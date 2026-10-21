'use strict';

class ErrorNegocio extends Error {
  constructor(mensaje, estadoHttp = 400) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.estadoHttp = estadoHttp;
  }
}

module.exports = { ErrorNegocio };

-- SST Kotoduo - Esquema relacional (PostgreSQL)
-- Base estructurada: usuarios, perfiles, trabajos, etapas y aprobaciones.

CREATE TABLE rol (
  id_rol      SMALLSERIAL PRIMARY KEY,
  nombre      VARCHAR(20) NOT NULL UNIQUE
              CHECK (nombre IN ('ADMINISTRADOR','PRODUCCION','DISENO','VENDEDOR','OPERARIO'))
);

CREATE TABLE area (
  id_area     SMALLSERIAL PRIMARY KEY,
  nombre      VARCHAR(40) NOT NULL UNIQUE,
  tipo        VARCHAR(15) NOT NULL
              CHECK (tipo IN ('COMERCIAL','DISENO','PRODUCCION','ADMINISTRACION'))
);

CREATE TABLE usuario (
  id_usuario        SERIAL PRIMARY KEY,
  nombre            VARCHAR(80)  NOT NULL,
  correo            VARCHAR(120) NOT NULL UNIQUE,
  hash_contrasena   VARCHAR(255) NOT NULL,
  id_rol            SMALLINT NOT NULL REFERENCES rol(id_rol) ON UPDATE CASCADE ON DELETE RESTRICT,
  id_area           SMALLINT REFERENCES area(id_area) ON UPDATE CASCADE ON DELETE RESTRICT,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  mfa_habilitado    BOOLEAN NOT NULL DEFAULT FALSE,
  intentos_fallidos SMALLINT NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta   TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sesion (
  id_sesion     UUID PRIMARY KEY,
  id_usuario    INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
  hash_token    CHAR(64) NOT NULL UNIQUE,
  expira_en     TIMESTAMPTZ NOT NULL,
  revocada      BOOLEAN NOT NULL DEFAULT FALSE,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tipo_trabajo (
  id_tipo     SMALLSERIAL PRIMARY KEY,
  nombre      VARCHAR(40) NOT NULL UNIQUE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- Flujo configurable: etapas definidas para cada tipo de trabajo (CP-02)
CREATE TABLE etapa_plantilla (
  id_etapa_plantilla SERIAL PRIMARY KEY,
  id_tipo            SMALLINT NOT NULL REFERENCES tipo_trabajo(id_tipo) ON DELETE RESTRICT,
  id_area            SMALLINT NOT NULL REFERENCES area(id_area) ON DELETE RESTRICT,
  orden              SMALLINT NOT NULL CHECK (orden > 0),
  nombre             VARCHAR(60) NOT NULL,
  UNIQUE (id_tipo, orden)
);

CREATE TABLE trabajo (
  id_trabajo        SERIAL PRIMARY KEY,
  codigo            VARCHAR(15) NOT NULL UNIQUE,
  id_tipo           SMALLINT NOT NULL REFERENCES tipo_trabajo(id_tipo) ON DELETE RESTRICT,
  descripcion       VARCHAR(300) NOT NULL,
  cantidad          INTEGER NOT NULL CHECK (cantidad > 0),
  fecha_compromiso  DATE NOT NULL,
  estado            VARCHAR(25) NOT NULL DEFAULT 'SOLICITADO'
                    CHECK (estado IN ('SOLICITADO','EN_DISENO','PENDIENTE_APROBACION',
                                      'EN_PRODUCCION','DETENIDO','TERMINADO')),
  id_vendedor       INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE etapa_trabajo (
  id_etapa_trabajo   SERIAL PRIMARY KEY,
  id_trabajo         INTEGER NOT NULL REFERENCES trabajo(id_trabajo) ON DELETE RESTRICT,
  id_etapa_plantilla INTEGER NOT NULL REFERENCES etapa_plantilla(id_etapa_plantilla) ON DELETE RESTRICT,
  orden              SMALLINT NOT NULL CHECK (orden > 0),
  estado             VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE'
                     CHECK (estado IN ('PENDIENTE','EN_CURSO','COMPLETADA')),
  id_responsable     INTEGER REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  inicio             TIMESTAMPTZ,
  termino            TIMESTAMPTZ,
  UNIQUE (id_trabajo, orden),
  CHECK (termino IS NULL OR inicio IS NULL OR termino >= inicio)
);

CREATE TABLE diseno (
  id_diseno      SERIAL PRIMARY KEY,
  id_trabajo     INTEGER NOT NULL REFERENCES trabajo(id_trabajo) ON DELETE RESTRICT,
  version        SMALLINT NOT NULL CHECK (version > 0),
  id_disenador   INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  ref_documento  CHAR(24) NOT NULL UNIQUE,   -- _id de la propuesta en MongoDB
  estado         VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE'
                 CHECK (estado IN ('PENDIENTE','APROBADO','RECHAZADO')),
  enviado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_trabajo, version)
);

CREATE TABLE aprobacion_diseno (
  id_aprobacion  SERIAL PRIMARY KEY,
  id_diseno      INTEGER NOT NULL UNIQUE REFERENCES diseno(id_diseno) ON DELETE RESTRICT,
  id_aprobador   INTEGER NOT NULL REFERENCES usuario(id_usuario) ON DELETE RESTRICT,
  decision       VARCHAR(10) NOT NULL CHECK (decision IN ('APROBADO','RECHAZADO')),
  motivo         VARCHAR(300),
  decidido_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (decision = 'APROBADO' OR motivo IS NOT NULL)
);

CREATE TABLE material (
  id_material  SERIAL PRIMARY KEY,
  nombre       VARCHAR(80) NOT NULL UNIQUE,
  unidad       VARCHAR(15) NOT NULL
);

CREATE TABLE trabajo_material (
  id_trabajo   INTEGER NOT NULL REFERENCES trabajo(id_trabajo) ON DELETE CASCADE,
  id_material  INTEGER NOT NULL REFERENCES material(id_material) ON DELETE RESTRICT,
  cantidad     NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  medida       VARCHAR(60),
  PRIMARY KEY (id_trabajo, id_material)
);

CREATE INDEX idx_trabajo_estado        ON trabajo(estado);
CREATE INDEX idx_etapa_trabajo_estado  ON etapa_trabajo(estado, id_etapa_plantilla);
CREATE INDEX idx_diseno_trabajo        ON diseno(id_trabajo);
CREATE INDEX idx_etapa_plantilla_area  ON etapa_plantilla(id_area);
CREATE INDEX idx_trabajo_compromiso    ON trabajo(estado, fecha_compromiso);

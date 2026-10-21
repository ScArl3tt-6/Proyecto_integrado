-- Datos base del caso Kotoduo (catálogos)
INSERT INTO rol (nombre) VALUES
  ('ADMINISTRADOR'),('PRODUCCION'),('DISENO'),('VENDEDOR'),('OPERARIO');

INSERT INTO area (nombre, tipo) VALUES
  ('Ventas','COMERCIAL'),
  ('Diseño','DISENO'),
  ('Bordado','PRODUCCION'),
  ('Sublimación','PRODUCCION'),
  ('Letreros','PRODUCCION'),
  ('Grabado','PRODUCCION'),
  ('Impresión gran formato','PRODUCCION'),
  ('Administración','ADMINISTRACION');

INSERT INTO tipo_trabajo (nombre) VALUES
  ('Bordado'),('Sublimación'),('Letrero'),('Grabado'),('Impresión gran formato');

-- Etapas productivas por tipo de trabajo (posteriores a la aprobación del diseño)
INSERT INTO etapa_plantilla (id_tipo, id_area, orden, nombre) VALUES
  (1, 3, 1, 'Preparación de matriz de bordado'),
  (1, 3, 2, 'Bordado de prendas'),
  (1, 3, 3, 'Control de calidad y embalaje'),
  (2, 4, 1, 'Impresión en papel transfer'),
  (2, 4, 2, 'Planchado y sublimado'),
  (2, 4, 3, 'Control de calidad y embalaje'),
  (3, 7, 1, 'Impresión de gráfica'),
  (3, 5, 2, 'Armado de estructura'),
  (3, 5, 3, 'Instalación en terreno'),
  (4, 6, 1, 'Grabado del soporte'),
  (4, 6, 2, 'Terminación y embalaje'),
  (5, 7, 1, 'Impresión'),
  (5, 7, 2, 'Corte y terminación');

INSERT INTO material (nombre, unidad) VALUES
  ('Hilo de bordar poliéster','cono'),
  ('Papel transfer','hoja'),
  ('Tinta sublimación','ml'),
  ('Vinilo adhesivo','m2'),
  ('Placa MDF 3 mm','unidad');

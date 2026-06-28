-- ============================================================
-- MenuGo - Base de datos compatible con Neon
-- Ejecutar en Neon SQL Editor sobre la base neondb
-- Este script limpia el esquema public y crea tablas + datos iniciales.
-- ============================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SET search_path TO public;

-- ============================================================
--  Menu_Go -- Base de Datos Completa (PostgreSQL)
--  Orden: Tablas > Indices > Permisos > Datos iniciales > Migracion
-- ============================================================


-- ============================================================
--  1. TABLAS PRINCIPALES
-- ============================================================

-- 1.1 ADMINISTRADOR
CREATE TABLE administrador (
    IdAdministrador SERIAL PRIMARY KEY,
    Usuario         VARCHAR(30)  NOT NULL UNIQUE,
    Clave           VARCHAR(255) NOT NULL,
    NombreCompleto  VARCHAR(100) NOT NULL,
    Correo          VARCHAR(100) NOT NULL UNIQUE,
    Estado          BOOLEAN      NOT NULL DEFAULT TRUE,
    FechaRegistro   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1.2 TRABAJADOR
CREATE TABLE trabajador (
    IdTrabajador        SERIAL       PRIMARY KEY,
    Nombres             VARCHAR(50)  NOT NULL,
    Apellidos           VARCHAR(50)  NOT NULL,
    Documento           CHAR(8)      NOT NULL UNIQUE,
    Telefono            CHAR(9)      NOT NULL,
    Correo              VARCHAR(100) NULL,
    Rol                 VARCHAR(30)  NOT NULL,
    Estado              BOOLEAN      NOT NULL DEFAULT TRUE,
    FechaInicioContrato DATE         NOT NULL,
    FechaFinContrato    DATE         NULL,
    Observaciones       VARCHAR(300) NULL,
    FechaRegistro       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT CK_Trabajador_DNI
        CHECK (LENGTH(Documento) = 8 AND Documento ~ '^[0-9]+$'),

    CONSTRAINT CK_Trabajador_Celular
        CHECK (LENGTH(Telefono) = 9 AND Telefono ~ '^[0-9]+$')
);

-- 1.3 USUARIOS
CREATE TABLE usuarios (
    id_usuario SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    telefono   VARCHAR(9)   UNIQUE NOT NULL,
    whatsapp   VARCHAR(9),
    rol        VARCHAR(20)  NOT NULL DEFAULT 'cliente',
    activo     BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT chk_usuario_telefono CHECK (telefono ~ '^[0-9]{9}$'),
    CONSTRAINT chk_usuario_whatsapp CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{9}$'),
    CONSTRAINT chk_usuario_rol      CHECK (rol IN ('cliente', 'mesero', 'cocina', 'administrador'))
);

-- 1.4 MESAS
CREATE TABLE mesas (
    id_mesa      SERIAL  PRIMARY KEY,
    numero_mesa  INTEGER UNIQUE NOT NULL,
    activo       BOOLEAN NOT NULL DEFAULT true
);

-- 1.5 GRUPOS DE MESA
CREATE TABLE grupos_mesa (
    id_grupo_mesa   SERIAL       PRIMARY KEY,
    nombre_grupo    VARCHAR(100),
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado          VARCHAR(20)  NOT NULL DEFAULT 'activo',

    CONSTRAINT chk_grupo_mesa_estado CHECK (estado IN ('activo', 'cerrado'))
);

-- 1.6 DETALLE DE GRUPOS DE MESA
CREATE TABLE grupo_mesa_detalle (
    id_grupo_mesa_detalle SERIAL  PRIMARY KEY,
    id_grupo_mesa         INTEGER NOT NULL REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE CASCADE,
    id_mesa               INTEGER NOT NULL REFERENCES mesas(id_mesa),
    UNIQUE (id_grupo_mesa, id_mesa)
);

-- 1.7 PLATOS
CREATE TABLE platos (
    id_plato         SERIAL         PRIMARY KEY,
    nombre           VARCHAR(100)   NOT NULL,
    descripcion      TEXT,
    precio           NUMERIC(10,2)  NOT NULL CHECK (precio > 0),
    stock            INTEGER        NOT NULL DEFAULT 0 CHECK (stock >= 0),
    disponible_llevar BOOLEAN       NOT NULL DEFAULT true,
    activo           BOOLEAN        NOT NULL DEFAULT true
);

-- 1.8 BEBIDAS
CREATE TABLE bebidas (
    id_bebida   SERIAL        PRIMARY KEY,
    nombre      VARCHAR(100)  NOT NULL,
    descripcion TEXT,
    precio      NUMERIC(10,2) NOT NULL CHECK (precio > 0),
    stock       INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    activo      BOOLEAN       NOT NULL DEFAULT true
);
-- ============================================================
-- FIX NECESARIO PARA QUE NO FALLEN LOS INSERTS (POSTGRESQL)
-- ============================================================

-- PLATOS (antes de usar codigo_plato en INSERT)
ALTER TABLE platos ADD COLUMN IF NOT EXISTS codigo_plato VARCHAR(40);
ALTER TABLE platos ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);
ALTER TABLE platos ADD COLUMN IF NOT EXISTS imagen TEXT;

-- necesario para ON CONFLICT



-- BEBIDAS (antes de usar codigo_bebida en INSERT)
ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS codigo_bebida VARCHAR(40);
ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS categoria VARCHAR(50);
ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS imagen TEXT;


-- 1.9 PEDIDOS
CREATE TABLE pedidos (
    id_pedido       SERIAL       PRIMARY KEY,
    id_grupo_mesa   INTEGER      REFERENCES grupos_mesa(id_grupo_mesa),
    id_usuario      INTEGER      NOT NULL REFERENCES usuarios(id_usuario),
    tipo_pedido     VARCHAR(20)  NOT NULL,
    nombre_cliente  VARCHAR(100) NOT NULL,
    telefono_llevar VARCHAR(9),
    estado          VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
    fecha_creacion  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registrado_por  INTEGER      REFERENCES usuarios(id_usuario),

    CONSTRAINT chk_pedido_tipo    CHECK (tipo_pedido IN ('mesa', 'llevar')),
    CONSTRAINT chk_pedido_estado  CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'pagado', 'cancelado')),
    CONSTRAINT chk_telefono_llevar CHECK (telefono_llevar IS NULL OR telefono_llevar ~ '^[0-9]{9}$'),
    CONSTRAINT chk_pedido_mesa_llevar CHECK (
        (tipo_pedido = 'mesa' AND id_grupo_mesa IS NOT NULL)
        OR
        (tipo_pedido = 'llevar')
    )
);

-- 1.10 HISTORIAL DE CAMBIO DE MESAS
CREATE TABLE mesas_historial (
    id_historial    SERIAL    PRIMARY KEY,
    id_pedido       INTEGER   NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_mesa_origen  INTEGER   REFERENCES mesas(id_mesa),
    id_mesa_destino INTEGER   REFERENCES mesas(id_mesa),
    fecha_cambio    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo          VARCHAR(200)
);

-- 1.11 DETALLE PRODUCTO
CREATE TABLE detalle_producto (
    id_detalle_producto SERIAL        PRIMARY KEY,
    id_pedido           INTEGER       NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    tipo_producto       VARCHAR(20)   NOT NULL,
    id_plato            INTEGER       REFERENCES platos(id_plato),
    id_bebida           INTEGER       REFERENCES bebidas(id_bebida),
    cantidad            INTEGER       NOT NULL CHECK (cantidad > 0),
    precio_unitario     NUMERIC(10,2) NOT NULL CHECK (precio_unitario > 0),
    subtotal            NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    observacion         TEXT,

    CONSTRAINT chk_tipo_producto CHECK (tipo_producto IN ('plato', 'bebida')),

    CONSTRAINT chk_detalle_producto_tipo CHECK (
        (tipo_producto = 'plato'  AND id_plato  IS NOT NULL AND id_bebida IS NULL)
        OR
        (tipo_producto = 'bebida' AND id_bebida IS NOT NULL AND id_plato  IS NULL)
    )
);

-- 1.12 SEGUIMIENTO DE COCINA
CREATE TABLE seguimiento_cocina (
    id_seguimiento      SERIAL    PRIMARY KEY,
    id_detalle_producto INTEGER   NOT NULL UNIQUE REFERENCES detalle_producto(id_detalle_producto) ON DELETE CASCADE,
    estado              VARCHAR(20) NOT NULL DEFAULT 'recibido',
    recibido_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    preparando_at       TIMESTAMP,
    listo_at            TIMESTAMP,
    entregado_at        TIMESTAMP,
    cancelado_at        TIMESTAMP,

    CONSTRAINT chk_seguimiento_estado CHECK (estado IN ('recibido', 'preparando', 'listo', 'entregado', 'cancelado'))
);

-- 1.13 CUENTAS
CREATE TABLE cuentas (
    id_cuenta     SERIAL        PRIMARY KEY,
    id_grupo_mesa INTEGER       NOT NULL REFERENCES grupos_mesa(id_grupo_mesa),
    descripcion   VARCHAR(200),
    tipo_cuenta   VARCHAR(20)   NOT NULL DEFAULT 'mixta',
    total         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    estado        VARCHAR(20)   NOT NULL DEFAULT 'pendiente',

    CONSTRAINT chk_tipo_cuenta   CHECK (tipo_cuenta IN ('comida', 'bebidas', 'mixta', 'personalizada')),
    CONSTRAINT chk_estado_cuenta CHECK (estado IN ('pendiente', 'pagada'))
);

-- 1.14 PAGOS
CREATE TABLE pagos (
    id_pago      SERIAL        PRIMARY KEY,
    id_cuenta    INTEGER       NOT NULL REFERENCES cuentas(id_cuenta) ON DELETE CASCADE,
    metodo_pago  VARCHAR(30)   NOT NULL,
    monto        NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    pagado_por   VARCHAR(100),
    fecha_pago   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_pago  VARCHAR(20)   NOT NULL DEFAULT 'pendiente',

    CONSTRAINT chk_metodo_pago CHECK (
        metodo_pago IN ('efectivo', 'yape', 'plin', 'tarjeta_credito', 'tarjeta_debito')
    ),
    CONSTRAINT chk_estado_pago CHECK (estado_pago IN ('pendiente', 'pagado', 'fallido'))
);

-- 1.15 COMPROBANTES
CREATE TABLE comprobantes (
    id_comprobante  SERIAL    PRIMARY KEY,
    id_pago         INTEGER   NOT NULL UNIQUE REFERENCES pagos(id_pago) ON DELETE CASCADE,
    tipo_comprobante VARCHAR(20) NOT NULL,
    dni             VARCHAR(8),
    ruc             VARCHAR(11),
    razon_social    VARCHAR(150),
    fecha_emision   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_tipo_comprobante CHECK (tipo_comprobante IN ('boleta', 'factura')),
    CONSTRAINT chk_dni_formato      CHECK (dni IS NULL OR dni ~ '^[0-9]{8}$'),
    CONSTRAINT chk_ruc_formato      CHECK (ruc IS NULL OR ruc ~ '^[0-9]{11}$'),

    CONSTRAINT chk_comprobante_datos CHECK (
        (tipo_comprobante = 'boleta'  AND dni IS NOT NULL AND ruc IS NULL        AND razon_social IS NULL)
        OR
        (tipo_comprobante = 'factura' AND ruc IS NOT NULL AND razon_social IS NOT NULL AND dni IS NULL)
    )
);


-- ============================================================
--  2. INDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_pedidos_estado   ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_grupo    ON pedidos(id_grupo_mesa);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido   ON detalle_producto(id_pedido);
CREATE INDEX IF NOT EXISTS idx_cuentas_estado   ON cuentas(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_cuenta     ON pagos(id_cuenta);


-- ============================================================
--  4. DATOS INICIALES -- MESAS
-- ============================================================

INSERT INTO mesas (numero_mesa, activo)
SELECT n, true FROM generate_series(1, 20) AS n
ON CONFLICT (numero_mesa) DO NOTHING;


-- ============================================================
--  5. DATOS INICIALES -- PLATOS
-- ============================================================

-- Ceviches
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-001', 'Ceviche de caballa', 'Pescado fresco marinado en limón, cebolla y culantro.', 'ceviches', 29, 200, true, true, 'https://jameaperu.com/assets/images/2026/03/ceviche-de-caballa_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-002', 'Ceviche de filete', 'Filete fresco en leche de tigre clásica de la casa.', 'ceviches', 29, 200, true, true, 'https://micevichedehoy.com/assets/images/ceviche-de-pescado_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-003-1', 'Ceviche de cabrillón (Chico)', 'Cabrillón fresco con limón, cebolla y guarnición marina.', 'ceviches', 49, 200, true, true, 'https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-003-2', 'Ceviche de cabrillón (Grande)', 'Cabrillón fresco con limón, cebolla y guarnición marina.', 'ceviches', 79, 200, true, true, 'https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-004-1', 'Ceviche mixto (Chico)', 'Pescado y mariscos frescos marinados al momento.', 'ceviches', 59, 200, true, true, 'https://resizer.glanacion.com/resizer/v2/ceviche-mixto-LJZOCGVFLRA2PMPON3P7GVOKZE.jpg?auth=ca0a3f372ba160f268600418a6b1ebc294040d69bb08eee5c4ae4cd47a89beb6&width=880&height=586&quality=70&smart=true') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-004-2', 'Ceviche mixto (Grande)', 'Pescado y mariscos frescos marinados al momento.', 'ceviches', 89, 200, true, true, 'https://resizer.glanacion.com/resizer/v2/ceviche-mixto-LJZOCGVFLRA2PMPON3P7GVOKZE.jpg?auth=ca0a3f372ba160f268600418a6b1ebc294040d69bb08eee5c4ae4cd47a89beb6&width=880&height=586&quality=70&smart=true') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-005-1', 'Ceviche conchas negras (Chico)', 'Conchas negras con limón, cebolla y sabor intenso norteño.', 'ceviches', 30, 200, true, true, 'https://micevichedehoy.com/assets/images/ceviche-de-conchas-negras_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-005-2', 'Ceviche conchas negras (Grande)', 'Conchas negras con limón, cebolla y sabor intenso norteño.', 'ceviches', 55, 200, true, true, 'https://micevichedehoy.com/assets/images/ceviche-de-conchas-negras_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-006-1', 'Ceviche de pulpo (Chico)', 'Pulpo en láminas con leche de tigre y toque cítrico.', 'ceviches', 35, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZYKSo1gbU6QEgqBCHjB9bnRFUZRXisS-iZA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-006-2', 'Ceviche de pulpo (Grande)', 'Pulpo en láminas con leche de tigre y toque cítrico.', 'ceviches', 50, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZYKSo1gbU6QEgqBCHjB9bnRFUZRXisS-iZA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-007-1', 'Ceviche langostino (Chico)', 'Langostinos frescos marinados con limón y culantro.', 'ceviches', 35, 200, true, true, 'https://buenazo.cronosmedia.glr.pe/original/2020/10/09/5f80f0086490fc023e0ac831.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-007-2', 'Ceviche langostino (Grande)', 'Langostinos frescos marinados con limón y culantro.', 'ceviches', 50, 200, true, true, 'https://buenazo.cronosmedia.glr.pe/original/2020/10/09/5f80f0086490fc023e0ac831.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-008-1', 'Ceviche de mero (Chico)', 'Mero fresco con preparación clásica de cevichería.', 'ceviches', 49, 200, true, true, 'https://www.cocinadelirante.com/sites/default/files/images/2019/10/receta-de-ceviche-de-mero.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-008-2', 'Ceviche de mero (Grande)', 'Mero fresco con preparación clásica de cevichería.', 'ceviches', 79, 200, true, true, 'https://www.cocinadelirante.com/sites/default/files/images/2019/10/receta-de-ceviche-de-mero.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-009', 'Ceviche mixto de filete', 'Filete con mariscos en leche de tigre tradicional.', 'ceviches', 39, 200, true, true, 'https://www.shutterstock.com/image-photo/ceviche-mixto-traditional-peruvian-dish-600nw-2582938301.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-010-1', 'Ceviche de calamar (Chico)', 'Calamar fresco con limón, cebolla y culantro.', 'ceviches', 35, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQI0UXFzfE1kVv0CRqMhN-uw1xM-IhcmGBdwg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-010-2', 'Ceviche de calamar (Grande)', 'Calamar fresco con limón, cebolla y culantro.', 'ceviches', 45, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQI0UXFzfE1kVv0CRqMhN-uw1xM-IhcmGBdwg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-011-1', 'Ceviche de langostinos (Chico)', 'Langostinos marinados en limón y leche de tigre.', 'ceviches', 35, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/10/0a/5d/0e/ceviche-mixto-pescado.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-011-2', 'Ceviche de langostinos (Grande)', 'Langostinos marinados en limón y leche de tigre.', 'ceviches', 50, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/10/0a/5d/0e/ceviche-mixto-pescado.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-012', 'Ceviche de cabrillón con conchas negras', 'Cabrillón con conchas negras y sabor marino intenso.', 'ceviches', 64, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQRi1wxhYSdp_id1zyWVCyrCJhPEI2hC7VDQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-013', 'Ceviche de mero con conchas negras', 'Mero fresco combinado con conchas negras.', 'ceviches', 64, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/12/cf/27/a9/ceviche-clasico-pescado.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-014-1', 'Ceviche de cabrilla (Chico)', 'Cabrilla fresca en leche de tigre tradicional.', 'ceviches', 39, 200, true, true, 'https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-014-2', 'Ceviche de cabrilla (Grande)', 'Cabrilla fresca en leche de tigre tradicional.', 'ceviches', 49, 200, true, true, 'https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-015', 'Conchas a la parmesana', 'Conchas gratinadas con queso parmesano.', 'ceviches', 33, 200, true, true, 'https://jameaperu.com/assets/images/conchitas-a-la-parmesana_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-016', 'Choros a la chalaca', 'Choros con cebolla, tomate, limón y maíz.', 'ceviches', 20, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1Y2_uIubUM5q5duePMkC4j3a_wKLiPiH0eg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-017', 'Conchas negras asadas', 'Conchas negras asadas con sazón de la casa.', 'ceviches', 24, 200, true, true, 'https://www.recetasnestle.com.ec/sites/default/files/srh_recipes/3ed7da39f9c6e65b81eedfebfd0e2403.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cev-018', 'Ceviche crocante', 'Ceviche con textura crocante y leche de tigre.', 'ceviches', 35, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLG0RKYESFV83wxlyLFZ0k_vT47ysit3MfgA&s') ON CONFLICT (codigo_plato) DO NOTHING;

-- Tiraditos
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('tir-001', 'Tiradito clásico', 'Láminas de pescado con limón y sazón clásica.', 'tiraditos', 30, 200, true, true, 'https://www.comida-peruana.com/base/stock/Recipe/tiradito/tiradito_web.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('tir-002', 'Tiradito amarillo', 'Pescado en crema suave de ají amarillo.', 'tiraditos', 34, 200, true, true, 'https://blog.renaware.com/wp-content/uploads/2018/01/Tiradito-3779-new-logo.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('tir-003', 'Tiradito rocotero', 'Láminas de pescado con crema de rocoto.', 'tiraditos', 34, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/H6YJvNpSRMKGdcM5E-300-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('tir-004', 'Tiradito Nikei', 'Tiradito con toque oriental, soya y kión.', 'tiraditos', 35, 200, true, true, 'https://okamisushibar.com/wp-content/uploads/2023/12/TIRADITO-NIKKEI.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('tir-005', 'Tiradito tricolor', 'Tres cremas de la casa sobre pescado fresco.', 'tiraditos', 38, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/wYtSHqGgtTgj8x9FW-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;

-- Leches de tigre
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('lec-001', 'Leche tigre clásico', 'Leche de tigre cítrica con guarnición marina.', 'leches', 20, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkz_WEUFsAkGH8qtOnmS6rHC1vFb08ZU4O5g&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('lec-002', 'Leche tigre de la casa', 'Versión especial con mariscos crocantes.', 'leches', 29, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/94Gv7PzB9ffusmeFH-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;

-- Causas
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-001', 'Causa acevichada', 'Causa de papa amarilla con topping acevichado.', 'causas', 28, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSpudShwld8HmX1ar-bze25hOoOEuqo7f4QEg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-002', 'Causa en salsa de mariscos', 'Causa cubierta con salsa cremosa de mariscos.', 'causas', 29, 200, true, true, 'https://www.laylita.com/recetas/wp-content/uploads/2025/02/Causa-de-camaron-receta-facil-1024x768.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-003', 'Causa con pulpo al olivo', 'Causa con pulpo y crema al olivo.', 'causas', 28, 200, true, true, 'https://i.ytimg.com/vi/AjSVuWWBdOc/maxresdefault.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-004', 'Causa crocante', 'Causa con topping crocante de la casa.', 'causas', 28, 200, true, true, 'https://lacamara.pe/wp-content/uploads/2023/07/causa-crocante-de-tuna.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-005', 'Causa con langostinos en salsa golf', 'Causa con langostinos y salsa golf.', 'causas', 29, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9mE0OsUutmi9Cy63g1wZr1L6oCU1Q5ax81w&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-006', 'Causa de pollo', 'Causa clásica rellena de pollo.', 'causas', 28, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQbrqr3CG3ZiL65c24eb104oddzN3ZKNWh6mA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('cau-007', 'Trilogía de causas', 'Tres causas variadas para compartir.', 'causas', 38, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/ALE9ZMgyoEaHQKuSd-512-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;

-- Duos
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-001', 'Arroz con mariscos + ceviche', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/1b/2e/58/5d/combinado-clasico-arroz.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-002', 'Arroz con mariscos + chicharrón de filete', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/bEk3uoXmnpgCGqoCk-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-003', 'Arroz con mariscos + causa acevichada', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQloCS-diZBHZHaNxRgOwvBd7idH1YVTDDICA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-004', 'Chicharrón de filete + ceviche', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://walac.pe/wp-content/uploads/2024/01/Prepara-un-delicioso-duo-norteno.png') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-005', 'Chicharrón de filete + causa acevichada', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ6RAay2taIMb7cT_io2AdcYZKTSZfokl4XBA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('duo-006', 'Causa acevichada + ceviche', 'Combinación marina.', 'duo', 40, 200, true, true, 'https://acomer.pe/wp-content/uploads/2017/07/causaacebichadaweb.jpg') ON CONFLICT (codigo_plato) DO NOTHING;

-- Rondas
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ron-001-1', 'Ronda criolla (Chico)', 'Piqueo criollo variado para compartir.', 'rondas', 69, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/19/e5/1a/6b/ronda-criolla-piurana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ron-001-2', 'Ronda criolla (Grande)', 'Piqueo criollo variado para compartir.', 'rondas', 89, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/19/e5/1a/6b/ronda-criolla-piurana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ron-002-1', 'Ronda marina (Chico)', 'Selección marina variada para compartir.', 'rondas', 69, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-m/1280/18/24/c6/58/ronda-marina-una-delicia.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ron-002-2', 'Ronda marina (Grande)', 'Selección marina variada para compartir.', 'rondas', 89, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-m/1280/18/24/c6/58/ronda-marina-una-delicia.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ron-003', 'Carrusel marino', 'Gran selección marina para grupo.', 'rondas', 119, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQyK1qm20QIHVO_Usc-XqQ0cxbk-9vJ8pz6g&s') ON CONFLICT (codigo_plato) DO NOTHING;

-- Chicharrones
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-001-1', 'Chicharrón de mero (Chico)', 'Mero frito crocante con sazón marina.', 'chicharron', 50, 200, true, true, 'https://especiasmontero.com/wp-content/uploads/2023/04/Chicharrones-de-Mero-1.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-001-2', 'Chicharrón de mero (Grande)', 'Mero frito crocante con sazón marina.', 'chicharron', 70, 200, true, true, 'https://especiasmontero.com/wp-content/uploads/2023/04/Chicharrones-de-Mero-1.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-002-1', 'Chicharrón de mixto (Chico)', 'Mariscos mixtos crocantes para compartir.', 'chicharron', 60, 200, true, true, 'https://berypez.pe/wp-content/uploads/2024/05/p03-fuente-chicharron-mixto.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-002-2', 'Chicharrón de mixto (Grande)', 'Mariscos mixtos crocantes para compartir.', 'chicharron', 80, 200, true, true, 'https://berypez.pe/wp-content/uploads/2024/05/p03-fuente-chicharron-mixto.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-003-1', 'Chicharrón de filete (Chico)', 'Filete de pescado crocante.', 'chicharron', 29, 200, true, true, 'https://i.ytimg.com/vi/qSwHv_Hl6DA/sddefault.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-003-2', 'Chicharrón de filete (Grande)', 'Filete de pescado crocante.', 'chicharron', 49, 200, true, true, 'https://i.ytimg.com/vi/qSwHv_Hl6DA/sddefault.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-004-1', 'Chicharrón de pollo (Chico)', 'Pollo crocante con guarnición.', 'chicharron', 30, 200, true, true, 'https://i.ytimg.com/vi/CYAUf6A3cSI/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLDwg9wDOTNyVoQOQ01W2nPx8uz2JA') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-004-2', 'Chicharrón de pollo (Grande)', 'Pollo crocante con guarnición.', 'chicharron', 45, 200, true, true, 'https://i.ytimg.com/vi/CYAUf6A3cSI/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLDwg9wDOTNyVoQOQ01W2nPx8uz2JA') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-005-1', 'Chicharrón de calamar (Chico)', 'Calamar crocante acompañado de salsa.', 'chicharron', 39, 200, true, true, 'https://es.cravingsjournal.com/wp-content/uploads/2018/07/chicharron-de-calamar-3.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-005-2', 'Chicharrón de calamar (Grande)', 'Calamar crocante acompañado de salsa.', 'chicharron', 50, 200, true, true, 'https://es.cravingsjournal.com/wp-content/uploads/2018/07/chicharron-de-calamar-3.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-006-1', 'Chicharrón de langostinos (Chico)', 'Langostinos crocantes con guarnición.', 'chicharron', 39, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdAGChGoJDQJTJuQ39YluQCANMo16otMOZHg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-006-2', 'Chicharrón de langostinos (Grande)', 'Langostinos crocantes con guarnición.', 'chicharron', 50, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdAGChGoJDQJTJuQ39YluQCANMo16otMOZHg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-007-1', 'Chicharrón de pulpo (Chico)', 'Pulpo crocante con salsa de la casa.', 'chicharron', 39, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQuydMsUL2riJmv4MIi1deBG9lr65SEGVmcEQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('chi-007-2', 'Chicharrón de pulpo (Grande)', 'Pulpo crocante con salsa de la casa.', 'chicharron', 50, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQuydMsUL2riJmv4MIi1deBG9lr65SEGVmcEQ&s') ON CONFLICT (codigo_plato) DO NOTHING;

-- Jaleas
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('jal-001-1', 'Jalea de mero (Chico)', 'Jalea de mero con guarnición marina.', 'jalea', 50, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQaA81SuYQtkfk8Jmr9zgslfQrAKlkCkVmvnQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('jal-001-2', 'Jalea de mero (Grande)', 'Jalea de mero con guarnición marina.', 'jalea', 70, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQaA81SuYQtkfk8Jmr9zgslfQrAKlkCkVmvnQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('jal-002-1', 'Jalea mixta (Chico)', 'Jalea de pescado y mariscos para compartir.', 'jalea', 65, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcScyKY-QTut4wqK9kGVcWmQMMwymPNRU7rFog&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('jal-002-2', 'Jalea mixta (Grande)', 'Jalea de pescado y mariscos para compartir.', 'jalea', 85, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcScyKY-QTut4wqK9kGVcWmQMMwymPNRU7rFog&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('jal-003', 'Jalea de cabrilla', 'Cabrilla crocante con zarza criolla.', 'jalea', 49, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/ZAdawpRHo6AEpZHEz-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;

-- Sudados
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-001-1', 'Sudado de mero (Chico)', 'Mero sudado con fondo marino y verduras.', 'sudados', 49, 200, true, true, 'https://origin.cronosmedia.glr.pe/large/2021/03/18/lg_605360564332ac2dfc54e0cb.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-001-2', 'Sudado de mero (Grande)', 'Mero sudado con fondo marino y verduras.', 'sudados', 79, 200, true, true, 'https://origin.cronosmedia.glr.pe/large/2021/03/18/lg_605360564332ac2dfc54e0cb.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-002-1', 'Sudado de cabrillón (Chico)', 'Cabrillón en jugo concentrado de la casa.', 'sudados', 49, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/f8qeDQWCCY3dmPvBA-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-002-2', 'Sudado de cabrillón (Grande)', 'Cabrillón en jugo concentrado de la casa.', 'sudados', 79, 200, true, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/f8qeDQWCCY3dmPvBA-2400-x.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-003', 'Sudado de cabrilla', 'Cabrilla sudada con verduras y culantro.', 'sudados', 45, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDmc4nufr8H3s1eJGObk-t-5-42cvn5QZQ-w&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-004-1', 'Sudado de mero a lo macho (Chico)', 'Mero en salsa a lo macho con mariscos.', 'sudados', 59, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRO0c_s2kYyDbCc_CPOtAoReeADBMRXNfkWlA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-004-2', 'Sudado de mero a lo macho (Grande)', 'Mero en salsa a lo macho con mariscos.', 'sudados', 89, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRO0c_s2kYyDbCc_CPOtAoReeADBMRXNfkWlA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-005', 'Chupe de langostinos', 'Chupe cremoso con langostinos.', 'sudados', 40, 200, true, true, 'https://www.machupicchu.biz/imagenes/articulos/chupe-de-cangrejo-con-huevo.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-006', 'Chupe de cangrejo', 'Chupe con cangrejo y fondo marino.', 'sudados', 49, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/01/parihuela.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-007-1', 'Parihuela de mero (Chico)', 'Sopa marina concentrada con mero.', 'sudados', 59, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTXwUNEQFvmOeYrHA1R2IOGDwIWpQPCdGhkGA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-007-2', 'Parihuela de mero (Grande)', 'Sopa marina concentrada con mero.', 'sudados', 79, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTXwUNEQFvmOeYrHA1R2IOGDwIWpQPCdGhkGA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-008-1', 'Parihuela de cabrillón (Chico)', 'Parihuela norteña con cabrillón.', 'sudados', 59, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhp-BMee0q41Z4IWUTZPCjRmwdFS7ciP1X8A&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-008-2', 'Parihuela de cabrillón (Grande)', 'Parihuela norteña con cabrillón.', 'sudados', 79, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhp-BMee0q41Z4IWUTZPCjRmwdFS7ciP1X8A&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-009-1', 'Pasado de cabrillón (Chico)', 'Cabrillón pasado en caldo de la casa.', 'sudados', 49, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/09/fb/ab/dc/el-ganso-azul.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-009-2', 'Pasado de cabrillón (Grande)', 'Cabrillón pasado en caldo de la casa.', 'sudados', 79, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/09/fb/ab/dc/el-ganso-azul.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-010-1', 'Pasado de mero (Chico)', 'Mero pasado en caldo marino.', 'sudados', 49, 200, true, true, 'https://placehold.co/600x400/f8fafc/334155?text=Foto+del+plato') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('sud-010-2', 'Pasado de mero (Grande)', 'Mero pasado en caldo marino.', 'sudados', 79, 200, true, true, 'https://placehold.co/600x400/f8fafc/334155?text=Foto+del+plato') ON CONFLICT (codigo_plato) DO NOTHING;

-- Entradas
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ent-001', 'Tequeños', 'Tequeños rellenos para compartir.', 'entradas', 24, 200, true, true, 'https://jameaperu.com/assets/images/tequenos_800x534.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ent-002', 'Pulpo al olivo', 'Pulpo con salsa cremosa al olivo.', 'entradas', 30, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLG35XX8rX62tcGXJvh5RhlEqLcTeH6LVhtQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ent-003', 'Tamalito verde', 'Tamal verde tradicional servido caliente.', 'entradas', 10, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRupe809kf6Xk-kNVk2sN6KwWBvWA3CBjU9rg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ent-004', 'Papa a la huancaína', 'Papa con crema huancaína clásica.', 'entradas', 8, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRMt-wTgx87RaNMkaNKNpJ4yCNk11eCtw2_dw&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('ent-005', 'Ocopa', 'Papa con crema de ocopa tradicional.', 'entradas', 8, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3mZhTC61gTPlAg-AfRRZP5eEfR1dc5fpCQQ&s') ON CONFLICT (codigo_plato) DO NOTHING;

-- Arroces
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-001-1', 'Arroz con mariscos (Chico)', 'Arroz salteado con mariscos y sazón marina.', 'arroces', 30, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVFi5GZzm4u56E3Cefr0K9YXJf7FisZK21Mw&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-001-2', 'Arroz con mariscos (Grande)', 'Arroz salteado con mariscos y sazón marina.', 'arroces', 55, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVFi5GZzm4u56E3Cefr0K9YXJf7FisZK21Mw&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-002', 'Chaufa de marisco / carne / pollo', 'Arroz chaufa salteado al wok.', 'arroces', 24, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/02/arroz-chaufa-de-mariscos.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-003', 'Arroz chaufa especial', 'Chaufa especial con proteína variada.', 'arroces', 23, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRdptm3dmPqSvSiRyLRwxEFKke7AAlO8JR9gQ&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-004-1', 'Arroz tumbes con conchas negras (Chico)', 'Arroz marino con conchas negras.', 'arroces', 30, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/05/fb/d9/61/cevicheria-restaurant.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-004-2', 'Arroz tumbes con conchas negras (Grande)', 'Arroz marino con conchas negras.', 'arroces', 40, 200, true, true, 'https://media-cdn.tripadvisor.com/media/photo-s/05/fb/d9/61/cevicheria-restaurant.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-005-1', 'Aeropuerto (Pollo)', 'Mezcla de chaufa y tallarín salteado.', 'arroces', 17, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/05/aereopuero-receta-peruana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-005-2', 'Aeropuerto (Carne)', 'Mezcla de chaufa y tallarín salteado.', 'arroces', 20, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/05/aereopuero-receta-peruana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-005-3', 'Aeropuerto (Cerdo)', 'Mezcla de chaufa y tallarín salteado.', 'arroces', 22, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/05/aereopuero-receta-peruana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('arr-005-4', 'Aeropuerto (Especial)', 'Mezcla de chaufa y tallarín salteado.', 'arroces', 26, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/05/aereopuero-receta-peruana.jpg') ON CONFLICT (codigo_plato) DO NOTHING;

-- Especiales
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-001', 'Lomito a lo pobre', 'Lomo con huevo, plátano y papas fritas.', 'especiales', 34, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSz70MakVPLF6bDFHbdFCrUXLiSz7JT7Vp2dg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-002-1', 'Fettuccine (Al pesto)', 'Pasta cremosa con salsa a elección.', 'especiales', 34, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPqy9hzvU2R6-8278COnWuaoo6ZQctdaz74g&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-002-2', 'Fettuccine (A la huancaína)', 'Pasta cremosa con salsa a elección.', 'especiales', 36, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPqy9hzvU2R6-8278COnWuaoo6ZQctdaz74g&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-003-1', 'Pollo (A la parrilla)', 'Pollo servido con guarnición de la casa.', 'especiales', 20, 200, true, true, 'https://thumbs.dreamstime.com/b/pechugas-de-pollo-asadas-la-parrilla-con-las-patatas-fritas-y-ensalada-del-tomate-bocado-patata-almuerzo-malsano-delicioso-fondo-147048653.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-003-2', 'Pollo (A la plancha)', 'Pollo servido con guarnición de la casa.', 'especiales', 28, 200, true, true, 'https://thumbs.dreamstime.com/b/pechugas-de-pollo-asadas-la-parrilla-con-las-patatas-fritas-y-ensalada-del-tomate-bocado-patata-almuerzo-malsano-delicioso-fondo-147048653.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-004', 'Milanesa de pollo', 'Milanesa crocante con guarnición.', 'especiales', 35, 200, true, true, 'https://alicante.com.ar/wp-content/uploads/2022/06/jpeg-optimizer_iStock-1057832648-1.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-005-1', 'Saltado de pollo / Apanado (Saltado)', 'Pollo salteado o apanado según elección.', 'especiales', 20, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTUvXMU6nb5Lm0MUZkP5lNMmQ0empa-yZjZtA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-005-2', 'Saltado de pollo / Apanado (Apanado)', 'Pollo salteado o apanado según elección.', 'especiales', 20, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTUvXMU6nb5Lm0MUZkP5lNMmQ0empa-yZjZtA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-006-1', 'Bistec (Apanado)', 'Bistec servido con guarnición criolla.', 'especiales', 24, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAA6CfiOkg-Onwvw79VDJSTZxBFQPwmizHtA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-006-2', 'Bistec (A lo pobre)', 'Bistec servido con guarnición criolla.', 'especiales', 38, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAA6CfiOkg-Onwvw79VDJSTZxBFQPwmizHtA&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-007', 'Pulpo a la parrilla', 'Pulpo a la parrilla con sazón de la casa.', 'especiales', 30, 200, true, true, 'https://es.cravingsjournal.com/wp-content/uploads/2022/09/pulpo-a-la-parrilla-5.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-008-1', 'Tacu Tacu (Lomo)', 'Tacu tacu con proteína a elección.', 'especiales', 34, 200, true, true, 'https://es.cravingsjournal.com/wp-content/uploads/2023/08/tacu-tacu-de-frejoles-5.jpg') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('esp-008-2', 'Tacu Tacu (Mariscos)', 'Tacu tacu con proteína a elección.', 'especiales', 34, 200, true, true, 'https://es.cravingsjournal.com/wp-content/uploads/2023/08/tacu-tacu-de-frejoles-5.jpg') ON CONFLICT (codigo_plato) DO NOTHING;

-- Parrillas
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('par-001', 'Parrilla Familiar', 'Parrilla variada para compartir.', 'parrillas', 89, 200, true, true, 'https://elchaparral.com.pe/archivos/producto/25-27-parrilla-familiar-chaparral-muestra.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('par-002', 'Combo Parrillero', 'Combo parrillero variado para mesa.', 'parrillas', 89, 200, true, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1jAuSAFUn6QB0ynGArCiCM-q_R5OO4D3dBg&s') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('par-003', 'Churrasco a la parrilla', 'Corte a la parrilla con guarnición.', 'parrillas', 24, 200, true, true, 'https://elchaparral.com.pe/archivos/producto/30-32-churrasco-a-la-parrilla-muestra.webp') ON CONFLICT (codigo_plato) DO NOTHING;
INSERT INTO platos (codigo_plato, nombre, descripcion, categoria, precio, stock, disponible_llevar, activo, imagen) VALUES ('par-004', 'Anticuchos a la parrilla', 'Anticuchos con papa y salsa.', 'parrillas', 20, 200, true, true, 'https://comedera.com/wp-content/uploads/sites/9/2022/03/Anticucho-shutterstock_185287433.jpg') ON CONFLICT (codigo_plato) DO NOTHING;


-- ============================================================
--  6. DATOS INICIALES -- BEBIDAS
-- ============================================================

INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-001-1', 'Jugo de fresa (Vaso)', 'Jugo natural de fresa preparado al momento.', 'bebidas', 20, 200, true, 'https://cdn0.uncomo.com/es/posts/8/2/8/como_hacer_jugo_de_fresa_28828_600.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-001-2', 'Jugo de fresa (Jarra)', 'Jugo natural de fresa preparado al momento.', 'bebidas', 22, 200, true, 'https://cdn0.uncomo.com/es/posts/8/2/8/como_hacer_jugo_de_fresa_28828_600.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-002-1', 'Jugo de fresa con leche (Vaso)', 'Fresa licuada con leche.', 'bebidas', 22, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSk0yFMuGeW1TwNlxBdnWtEBbewLvHzRnxrnQ&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-002-2', 'Jugo de fresa con leche (Jarra)', 'Fresa licuada con leche.', 'bebidas', 24, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSk0yFMuGeW1TwNlxBdnWtEBbewLvHzRnxrnQ&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-003-1', 'Jugo de piña (Vaso)', 'Jugo natural de piña.', 'bebidas', 17, 200, true, 'https://www.laylita.com/recetas/wp-content/uploads/2016/09/Jugo-de-pina-casero.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-003-2', 'Jugo de piña (Jarra)', 'Jugo natural de piña.', 'bebidas', 19, 200, true, 'https://www.laylita.com/recetas/wp-content/uploads/2016/09/Jugo-de-pina-casero.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-004-1', 'Jugo de maracuyá (Vaso)', 'Bebida cítrica y refrescante.', 'bebidas', 15, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSddhAQe8yteIOqH0BM_U5BMwamCF4Z8wme2g&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-004-2', 'Jugo de maracuyá (Jarra)', 'Bebida cítrica y refrescante.', 'bebidas', 17, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSddhAQe8yteIOqH0BM_U5BMwamCF4Z8wme2g&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-005-1', 'Chicha morada (Vaso)', 'Bebida tradicional de maíz morado.', 'bebidas', 15, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjakEM64nsp_GqF2LAf-LoyLinMO1lPNpNKQ&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-005-2', 'Chicha morada (Jarra)', 'Bebida tradicional de maíz morado.', 'bebidas', 17, 200, true, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjakEM64nsp_GqF2LAf-LoyLinMO1lPNpNKQ&s') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-006-1', 'Limonada clásica (Vaso)', 'Limonada fresca preparada al momento.', 'bebidas', 15, 200, true, 'https://www.gastrolabweb.com/u/fotografias/m/2021/5/2/f1280x720-12606_144281_5050.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-006-2', 'Limonada clásica (Jarra)', 'Limonada fresca preparada al momento.', 'bebidas', 17, 200, true, 'https://www.gastrolabweb.com/u/fotografias/m/2021/5/2/f1280x720-12606_144281_5050.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-007-1', 'Limonada con hierba luisa (Vaso)', 'Limonada aromática con hierba luisa.', 'bebidas', 15, 200, true, 'https://comidasperuanas.net/wp-content/uploads/2023/09/Receta-de-Limonada-de-Hierba-Luisa.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-007-2', 'Limonada con hierba luisa (Jarra)', 'Limonada aromática con hierba luisa.', 'bebidas', 17, 200, true, 'https://comidasperuanas.net/wp-content/uploads/2023/09/Receta-de-Limonada-de-Hierba-Luisa.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-008-1', 'Maracumango (Vaso)', 'Mezcla tropical de maracuyá y mango.', 'bebidas', 23, 200, true, 'https://i.ytimg.com/vi/1I0MlrojsRY/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLBbTThXxB1rZALTDjcdumfu1xq3Sw') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-008-2', 'Maracumango (Jarra)', 'Mezcla tropical de maracuyá y mango.', 'bebidas', 25, 200, true, 'https://i.ytimg.com/vi/1I0MlrojsRY/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLBbTThXxB1rZALTDjcdumfu1xq3Sw') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-009-1', 'Agua de jamaica (Vaso)', 'Refresco natural de jamaica.', 'bebidas', 12, 200, true, 'https://www.infobae.com/resizer/v2/IDNEPYYXRJBFHBLLZZ5BO5OJDY.jpg?auth=dad66630ffc1b14e481b147e19b61f8c5600fa5bc65202fd671c31ab759f8981&smart=true&width=1024&height=512&quality=85') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('beb-009-2', 'Agua de jamaica (Jarra)', 'Refresco natural de jamaica.', 'bebidas', 14, 200, true, 'https://www.infobae.com/resizer/v2/IDNEPYYXRJBFHBLLZZ5BO5OJDY.jpg?auth=dad66630ffc1b14e481b147e19b61f8c5600fa5bc65202fd671c31ab759f8981&smart=true&width=1024&height=512&quality=85') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-001-1', 'Inca Kola / Coca-Cola 3 lt (Inca Kola)', 'Gaseosa familiar de 3 litros.', 'gaseosa', 15, 200, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/yuHehhyqJDhbF8G34-1000-x.webp') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-001-2', 'Inca Kola / Coca-Cola 3 lt (Coca-Cola)', 'Gaseosa familiar de 3 litros.', 'gaseosa', 15, 200, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/yuHehhyqJDhbF8G34-1000-x.webp') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-002-1', 'Inca Kola / Coca-Cola 1.5 lt (Inca Kola)', 'Gaseosa familiar de 1.5 litros.', 'gaseosa', 10, 200, true, 'https://media.falabella.com/tottusPE/43620260_1/w=1004,h=1500,fit=pad') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-002-2', 'Inca Kola / Coca-Cola 1.5 lt (Coca-Cola)', 'Gaseosa familiar de 1.5 litros.', 'gaseosa', 10, 200, true, 'https://media.falabella.com/tottusPE/43620260_1/w=1004,h=1500,fit=pad') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-003-1', 'Gaseosa personal (Coca-Cola)', 'Gaseosa personal a elección.', 'gaseosa', 4, 200, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/cazqzcXKSDScYnKqr-1000-x.webp') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-003-2', 'Gaseosa personal (Inka Kola)', 'Gaseosa personal a elección.', 'gaseosa', 4, 200, true, 'https://tofuu.getjusto.com/orioneat-local/resized2/cazqzcXKSDScYnKqr-1000-x.webp') ON CONFLICT (codigo_bebida) DO NOTHING;
INSERT INTO bebidas (codigo_bebida, nombre, descripcion, categoria, precio, stock, activo, imagen) VALUES ('gas-004', 'Agua San Luis 1 lt', 'Botella de agua.', 'gaseosa', 4, 200, true, 'https://miamarket.pe/assets/uploads/ef0ae3f32f287a43a30dd6f986c1e9dc.jpg') ON CONFLICT (codigo_bebida) DO NOTHING;


ALTER TABLE grupos_mesa ADD COLUMN IF NOT EXISTS mesa_principal INTEGER;

ALTER TABLE platos ADD COLUMN IF NOT EXISTS codigo_plato VARCHAR(40) UNIQUE;
ALTER TABLE platos ADD COLUMN IF NOT EXISTS categoria    VARCHAR(50);
ALTER TABLE platos ADD COLUMN IF NOT EXISTS imagen       TEXT;

ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS codigo_bebida VARCHAR(40) UNIQUE;
ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS categoria     VARCHAR(50);
ALTER TABLE bebidas ADD COLUMN IF NOT EXISTS imagen        TEXT;

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS referencia    VARCHAR(100);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS tipo_pago     VARCHAR(20) NOT NULL DEFAULT 'total';
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS mesa_pagadora VARCHAR(100);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS notas         TEXT;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS chk_pedido_estado;
ALTER TABLE pedidos ADD CONSTRAINT chk_pedido_estado
    CHECK (estado IN ('pendiente', 'preparando', 'listo', 'entregado', 'pagado', 'cancelado'));

CREATE TABLE IF NOT EXISTS detalle_pago (
    id_detalle_pago     SERIAL        PRIMARY KEY,
    id_pago             INTEGER       NOT NULL REFERENCES pagos(id_pago) ON DELETE CASCADE,
    id_detalle_producto INTEGER       NOT NULL REFERENCES detalle_producto(id_detalle_producto) ON DELETE CASCADE,
    monto               NUMERIC(12,2) NOT NULL CHECK (monto > 0)
);

CREATE TABLE IF NOT EXISTS solicitudes_cuenta (
    id_solicitud  SERIAL    PRIMARY KEY,
    id_grupo_mesa INTEGER   NOT NULL REFERENCES grupos_mesa(id_grupo_mesa) ON DELETE CASCADE,
    id_cuenta     INTEGER   REFERENCES cuentas(id_cuenta) ON DELETE SET NULL,
    estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    nota          TEXT,
    fecha_solicitud TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atendido_at   TIMESTAMP,
    CONSTRAINT chk_solicitud_estado CHECK (estado IN ('pendiente', 'atendida', 'cancelada'))
);

-- Cambiar nombre de columna en PLATOS
ALTER TABLE platos
RENAME COLUMN stock TO cantidad_de_platos;


-- Crear nueva columna en BEBIDAS
ALTER TABLE bebidas
ADD COLUMN cantidad_de_bebidas INTEGER DEFAULT 0;

-- Copia el stock inicial de bebidas al campo usado por el backend.
UPDATE bebidas
SET cantidad_de_bebidas = stock
WHERE cantidad_de_bebidas IS NULL OR cantidad_de_bebidas = 0;

-- ============================================================
-- QR DE MESAS PARA PRODUCCION
-- ============================================================
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_token VARCHAR(120);
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_activo BOOLEAN DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_qr_token
ON mesas(qr_token)
WHERE qr_token IS NOT NULL;

WITH datos(numero_mesa, qr_token) AS (
  VALUES
  (1, 'MG-MESA-01-9F5BA8CB417B'),
  (2, 'MG-MESA-02-0100EC9A8B92'),
  (3, 'MG-MESA-03-FAD9C7239E19'),
  (4, 'MG-MESA-04-4FF3BD8CBD46'),
  (5, 'MG-MESA-05-19396C7477A2'),
  (6, 'MG-MESA-06-CE1179310294'),
  (7, 'MG-MESA-07-48CA32AFC95C'),
  (8, 'MG-MESA-08-003CA8181D85'),
  (9, 'MG-MESA-09-60D3D79BC3E9'),
  (10, 'MG-MESA-10-E28DAF61E082'),
  (11, 'MG-MESA-11-6DA0FC111284'),
  (12, 'MG-MESA-12-8B3BA8F5625F'),
  (13, 'MG-MESA-13-3C2665B08E88'),
  (14, 'MG-MESA-14-25B95C55045C'),
  (15, 'MG-MESA-15-36DD577A341D'),
  (16, 'MG-MESA-16-68FE869CC56D'),
  (17, 'MG-MESA-17-36B57B875BC2'),
  (18, 'MG-MESA-18-3AE152EB5978'),
  (19, 'MG-MESA-19-C26D169D63B8'),
  (20, 'MG-MESA-20-E705F39DB6B9')
)
UPDATE mesas m
SET qr_token = d.qr_token,
    qr_activo = true,
    activo = true
FROM datos d
WHERE m.numero_mesa = d.numero_mesa;

-- Cambia TU-FRONTEND.vercel.app por tu dominio final de Vercel para generar los QR.
SELECT
  numero_mesa,
  qr_token,
  'https://TU-FRONTEND.vercel.app/Cliente/index.html?mesa=' || numero_mesa || '&token=' || qr_token AS url_qr
FROM mesas
WHERE numero_mesa BETWEEN 1 AND 20
ORDER BY numero_mesa;

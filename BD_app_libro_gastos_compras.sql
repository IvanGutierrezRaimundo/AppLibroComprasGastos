CREATE DATABASE IF NOT EXISTS `BD_app_libro_gastos_compras`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `BD_app_libro_gastos_compras`;

CREATE TABLE IF NOT EXISTS `proveedores` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nif` varchar(15) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `telefono` varchar(15) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `direccion` varchar(255) DEFAULT NULL,
  `ciudad` varchar(50) DEFAULT NULL,
  `provincia` varchar(50) DEFAULT NULL,
  `cp` varchar(10) DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_proveedores_nif` (`nif`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `libro_compras_gastos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fecha_factura` date NOT NULL,
  `proveedor` varchar(100) NOT NULL,
  `nif_cif` varchar(15) NOT NULL,
  `numero_factura` varchar(50) NOT NULL,
  `tipo_compra_gasto` enum('Compras y servicios','Alquileres','Reparaciones','Suministros','Tributos','Sueldos/salarios','S.S/autónomos','Inversiones','Otros') NOT NULL,
  `base_4` decimal(10,2) NOT NULL DEFAULT '0.00',
  `iva_4` decimal(10,2) NOT NULL DEFAULT '0.00',
  `base_10` decimal(10,2) NOT NULL DEFAULT '0.00',
  `iva_10` decimal(10,2) NOT NULL DEFAULT '0.00',
  `base_21` decimal(10,2) NOT NULL DEFAULT '0.00',
  `iva_21` decimal(10,2) NOT NULL DEFAULT '0.00',
  `ret_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `retencion` decimal(10,2) NOT NULL DEFAULT '0.00',
  `total_factura` decimal(10,2) NOT NULL DEFAULT '0.00',
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_libro_nif_cif` (`nif_cif`),
  KEY `idx_libro_fecha_factura` (`fecha_factura`),
  CONSTRAINT `chk_ret_percent` CHECK (((`ret_percent` >= 0) and (`ret_percent` <= 100)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Datos de ejemplo (inventados)
INSERT IGNORE INTO `proveedores` (`nif`, `nombre`, `telefono`, `email`, `direccion`, `ciudad`, `provincia`, `cp`) VALUES
('B12345678', 'Distribuciones Garcia SL', '912345678', 'pedidos@distgarcia.example', 'Calle Mayor 12', 'Madrid', 'Madrid', '28013'),
('B87654321', 'Inmobiliaria Centro SL', '985123456', 'admin@inmocentro.example', 'Plaza del Ayuntamiento 3', 'Oviedo', 'Asturias', '33003'),
('A28123456', 'Energia Hogar SA', '900100200', 'clientes@energiahogar.example', 'Avenida de la Luz 45', 'Madrid', 'Madrid', '28020'),
('B33445566', 'Harinas del Norte SL', '985334455', 'ventas@harinasnorte.example', 'Poligono Industrial Sur, Nave 7', 'Gijon', 'Asturias', '33211'),
('12345678Z', 'Juan Perez Lopez', '611222333', 'juan.perez@example.com', 'Calle Uria 20', 'Oviedo', 'Asturias', '33003'),
('P3300000A', 'Ayuntamiento de Oviedo', NULL, NULL, 'Plaza de la Constitucion 1', 'Oviedo', 'Asturias', '33009'),
('87654321X', 'Maria Gomez Ruiz', '622333444', 'maria.gomez@example.com', 'Calle Gascona 8', 'Oviedo', 'Asturias', '33001'),
('A08999999', 'Maquinaria Industrial SA', '934567890', 'comercial@maqindustrial.example', 'Carrer Industria 101', 'Barcelona', 'Barcelona', '08025');

INSERT INTO `libro_compras_gastos`
(`fecha_factura`, `proveedor`, `nif_cif`, `numero_factura`, `tipo_compra_gasto`, `base_4`, `iva_4`, `base_10`, `iva_10`, `base_21`, `iva_21`, `ret_percent`, `retencion`, `total_factura`) VALUES
('2026-01-15', 'Distribuciones Garcia SL', 'B12345678', 'FAC-2026-001', 'Compras y servicios', 0, 0, 0, 0, 1000.00, 210.00, 0, 0.00, 1210.00),
('2026-02-03', 'Inmobiliaria Centro SL', 'B87654321', 'A-0045', 'Alquileres', 0, 0, 0, 0, 800.00, 168.00, 19, 152.00, 816.00),
('2026-02-20', 'Energia Hogar SA', 'A28123456', 'EH-778812', 'Suministros', 0, 0, 0, 0, 120.50, 25.31, 0, 0.00, 145.81),
('2026-03-10', 'Harinas del Norte SL', 'B33445566', 'HN-2231', 'Compras y servicios', 200.00, 8.00, 150.00, 15.00, 0, 0, 0, 0.00, 373.00),
('2026-03-25', 'Juan Perez Lopez', '12345678Z', '2026/12', 'Reparaciones', 0, 0, 0, 0, 300.00, 63.00, 15, 45.00, 318.00),
('2026-04-05', 'Ayuntamiento de Oviedo', 'P3300000A', 'TASA-2026-04', 'Tributos', 0, 0, 0, 0, 0, 0, 0, 0.00, 150.00),
('2026-04-30', 'Maria Gomez Ruiz', '87654321X', 'MG-0007', 'Otros', 0, 0, 0, 0, 50.00, 10.50, 0, 0.00, 60.50),
('2026-05-12', 'Maquinaria Industrial SA', 'A08999999', 'MI-4410', 'Inversiones', 0, 0, 0, 0, 2500.00, 525.00, 0, 0.00, 3025.00);
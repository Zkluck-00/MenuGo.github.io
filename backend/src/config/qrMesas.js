const { adminPool: pool } = require("./db");

const TOKENS_MESAS = {
  1: "MG-MESA-01-9F5BA8CB417B",
  2: "MG-MESA-02-0100EC9A8B92",
  3: "MG-MESA-03-FAD9C7239E19",
  4: "MG-MESA-04-4FF3BD8CBD46",
  5: "MG-MESA-05-19396C7477A2",
  6: "MG-MESA-06-CE1179310294",
  7: "MG-MESA-07-48CA32AFC95C",
  8: "MG-MESA-08-003CA8181D85",
  9: "MG-MESA-09-60D3D79BC3E9",
  10: "MG-MESA-10-E28DAF61E082",
  11: "MG-MESA-11-6DA0FC111284",
  12: "MG-MESA-12-8B3BA8F5625F",
  13: "MG-MESA-13-3C2665B08E88",
  14: "MG-MESA-14-25B95C55045C",
  15: "MG-MESA-15-36DD577A341D",
  16: "MG-MESA-16-68FE869CC56D",
  17: "MG-MESA-17-36B57B875BC2",
  18: "MG-MESA-18-3AE152EB5978",
  19: "MG-MESA-19-C26D169D63B8",
  20: "MG-MESA-20-E705F39DB6B9"
};

async function prepararQrMesas() {
  await pool.query(`
    ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_token VARCHAR(120);
    ALTER TABLE mesas ADD COLUMN IF NOT EXISTS qr_activo BOOLEAN DEFAULT TRUE;
  `);

  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mesas_qr_token ON mesas(qr_token) WHERE qr_token IS NOT NULL`);
  } catch (error) {
    console.warn("No se pudo crear indice unico de qr_token:", error.message);
  }

  for (const [numeroTexto, token] of Object.entries(TOKENS_MESAS)) {
    const numero = Number(numeroTexto);
    const existente = await pool.query("SELECT id_mesa FROM mesas WHERE numero_mesa = $1 LIMIT 1", [numero]);

    if (existente.rows.length) {
      await pool.query(
        `UPDATE mesas
         SET qr_token = COALESCE(qr_token, $1), qr_activo = true, activo = COALESCE(activo, true)
         WHERE id_mesa = $2`,
        [token, existente.rows[0].id_mesa],
      );
    } else {
      await pool.query(
        `INSERT INTO mesas (numero_mesa, activo, qr_token, qr_activo)
         VALUES ($1, true, $2, true)`,
        [numero, token],
      );
    }
  }
}

function obtenerTokenMesa(numero) {
  return TOKENS_MESAS[Number(numero)] || null;
}

module.exports = { prepararQrMesas, obtenerTokenMesa, TOKENS_MESAS };

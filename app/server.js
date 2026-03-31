const express = require("express");
const mqtt = require("mqtt");
const mysql = require("mysql2/promise");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

//Config
const MQTT_HOST = process.env.MQTT_HOST || "localhost";
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const MQTT_TOPIC = "tele/tasmota_F5BED8/SENSOR";

const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || "teleinfo",
  user: process.env.DB_USER || "linky",
  password: process.env.DB_PASSWORD || "linkypassword",
};

//MySQL
let db;
async function initDB() {
  //Retry jusqu'à ce que MySQL soit prêt
  for (let i = 0; i < 10; i++) {
    try {
      db = await mysql.createPool(DB_CONFIG);
      await db.query(`
        CREATE TABLE IF NOT EXISTS teleinfo (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          timestamp    DATETIME NOT NULL,
          adresse      VARCHAR(20),
          puissance    INT,
          energie      BIGINT,
          created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_timestamp (timestamp)
        )
      `);
      console.log("MySQL connecté et table prête");
      return;
    } catch (err) {
      console.log(`MySQL pas prêt, retry ${i + 1}/10...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Impossible de se connecter à MySQL");
}

//MQTT
function initMQTT() {
  const client = mqtt.connect(`mqtt://${MQTT_HOST}:${MQTT_PORT}`);

  client.on("connect", () => {
    console.log("MQTT connecté");
    client.subscribe(MQTT_TOPIC, (err) => {
      if (err) console.error("Erreur subscription MQTT:", err);
      else console.log(`Abonné au topic: ${MQTT_TOPIC}`);
    });
  });
  client.on("message", async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      console.log("Message reçu:", payload);
      //Tasmota publie les données téléinfo dans payload.ENERGY ou directement
      //Structure typique Tasmota + Denky :
      //"Time": "2026-03-18T17:08:01"
      //"ADSC": "12345678",
      //"SINSTS": 450,
      //"EASF01": 12345678
      const time = payload.Time || new Date().toISOString();
      const adresse = payload.ADSC || payload.ADCO || null;
      const puissance = payload.SINSTS ?? null;
      const energie = payload.EASF01 ?? null;

      //On n'insère que si on a au moins la puissance ou l'énergie
      if (puissance === null && energie === null) {
        console.log("Pas de données téléinfo dans ce message, ignoré");
        return;
      }
      await db.query(
        `INSERT INTO teleinfo (timestamp, adresse, puissance, energie)
         VALUES (?, ?, ?, ?)`,
        [new Date(time), adresse, puissance, energie]
      );
      console.log(`Données enregistrées: ${puissance}VA / ${energie}Wh`);
    } catch (err) {
      console.error("Erreur traitement message:", err.message);
    }
  });
  client.on("error", (err) => console.error("Erreur MQTT:", err.message));
  client.on("offline", () => console.warn("MQTT hors ligne"));
}

//API REST
//Dernière valeur reçue
app.get("/api/latest", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM teleinfo ORDER BY timestamp DESC LIMIT 1`
    );
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Puissance instantanée sur les N dernières heures (pour courbe)
app.get("/api/puissance", async (req, res) => {
  const heures = parseInt(req.query.heures) || 24;
  try {
    const [rows] = await db.query(
      `SELECT timestamp, puissance
       FROM teleinfo
       WHERE timestamp >= NOW() - INTERVAL ? HOUR
         AND puissance IS NOT NULL
       ORDER BY timestamp ASC`,
      [heures]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Énergie consommée par pas de 10 min (pour histogramme)
app.get("/api/energie", async (req, res) => {
  const heures = parseInt(req.query.heures) || 24;
  try {
    const [rows] = await db.query(
      `SELECT
         DATE_FORMAT(
           DATE_SUB(timestamp, INTERVAL MOD(MINUTE(timestamp), 10) MINUTE),
           '%Y-%m-%d %H:%i:00'
         ) AS periode,
         MAX(energie) - MIN(energie) AS consommation
       FROM teleinfo
       WHERE timestamp >= NOW() - INTERVAL ? HOUR
         AND energie IS NOT NULL
       GROUP BY periode
       ORDER BY periode ASC`,
      [heures]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//Démarrage
async function start() {
  await initDB();
  initMQTT();
  app.listen(3000, () => {
    console.log("Serveur démarré sur http://localhost:3000");
  });
}

start().catch(console.error);

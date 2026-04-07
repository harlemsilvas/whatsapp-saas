const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const publicRoutes = require("./routes/publicRoutes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API rodando 🚀");
});

// Rotas públicas (URLs exigidas pela Meta: privacidade/termos/exclusão de dados)
app.use(publicRoutes);

app.use("/api", routes);

app.use(errorHandler);

module.exports = app;

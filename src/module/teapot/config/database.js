import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  development: {
    username: null,
    password: null,
    database: "pot",
    host: null,
    dialect: "sqlite",
    storage: path.join(__dirname, "../../../../pot.sqlite"),
    logging: false,
  },
  test: {
    username: null,
    password: null,
    database: "pot_test",
    host: null,
    dialect: "sqlite",
    storage: path.join(__dirname, "../../../../pot_test.sqlite"),
    logging: false,
  },
  production: {
    username: null,
    password: null,
    database: "pot",
    host: null,
    dialect: "sqlite",
    storage: path.join(__dirname, "../../../../pot.sqlite"),
    logging: false,
  },
};

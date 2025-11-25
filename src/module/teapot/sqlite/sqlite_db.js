import { Sequelize } from "sequelize";

export const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./pot.sqlite",
  logging: false,
});

export default sequelize;

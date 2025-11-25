import { DataTypes } from "sequelize";
import { sequelize } from "../sqlite/sqlite_db.js";

export const Account = sequelize.define('Account', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: 'Steam login username'
    },
    // Зашифровані credentials
    encryptedPassword: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: 'Encrypted Steam password'
    },
    encryptedSharedSecret: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted shared secret for 2FA'
    },
    encryptedIdentitySecret: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted identity secret for trade confirmations'
    },
    // Зашифровані session дані
    encryptedCookies: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted web session cookies'
    },
    encryptedRefreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Encrypted refresh token for automatic re-login'
    },
    // Метадані
    cookiesExpiry: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Expiry date for cookies'
    },
    steamId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        comment: 'Steam ID 64-bit'
    },
    lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Last successful login timestamp'
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: 'Is account active'
    },
    // Додаткові поля для логів
    loginAttempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        comment: 'Number of failed login attempts'
    },
    lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Last error message'
    }
}, {
    tableName: 'accounts',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['username']
        },
        {
            unique: true,
            fields: ['steamId']
        },
        {
            fields: ['isActive']
        },
        {
            fields: ['lastLogin']
        }
    ],
    hooks: {
        beforeCreate: (account) => {
            account.lastLogin = new Date();
        }
    }
});
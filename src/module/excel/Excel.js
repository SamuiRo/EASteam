import XLSX from 'xlsx-js-style';
import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { dirname } from 'path';

export class ExcelHandler {
    constructor(filePath = null) {
        this.filePath = filePath;
        this.workbook = null;
    }

    /**
     * Create new Excel file
     */
    createNew() {
        this.workbook = XLSX.utils.book_new();
        return this;
    }

    /**
     * Load Excel file
     */
    async load(filePath = this.filePath) {
        if (!filePath) {
            throw new Error('File path not specified');
        }

        this.filePath = filePath;
        const buffer = await readFile(filePath);
        this.workbook = XLSX.read(buffer, { type: 'buffer' });
        return this;
    }


    /**
     * Save Excel file
     */
    async save(filePath = this.filePath) {
        if (!filePath) {
            throw new Error('File path not specified');
        }

        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const buffer = XLSX.write(this.workbook, { type: 'buffer', bookType: 'xlsx' });

        const directory = dirname(filePath);
        try {
            await access(directory);
        } catch (error) {
            await mkdir(directory, { recursive: true });
        }

        await writeFile(filePath, buffer);
        return this;
    }

    /**
     * Get all pages
     */
    getSheetNames() {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }
        return this.workbook.SheetNames;
    }

    /**
     * Create new page
     */
    createSheet(sheetName, data = []) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const worksheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(this.workbook, worksheet, sheetName);
        return this;
    }

    /**
     * Delete page
     */
    deleteSheet(sheetName) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const index = this.workbook.SheetNames.indexOf(sheetName);
        if (index === -1) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }

        this.workbook.SheetNames.splice(index, 1);
        delete this.workbook.Sheets[sheetName];
        return this;
    }

    /**
     * Automatically adjust column width based on content
     * @private
     */
    _autoFitColumns(worksheet, data) {
        const colWidths = [];

        data.forEach(row => {
            row.forEach((cell, colIndex) => {
                const cellValue = cell?.toString() || '';
                const cellLength = cellValue.length;

                if (!colWidths[colIndex] || cellLength > colWidths[colIndex]) {
                    colWidths[colIndex] = cellLength;
                }
            });
        });

        worksheet['!cols'] = colWidths.map(width => ({
            wch: Math.min(Math.max(width + 2, 10), 50)
        }));
    }

    /**
     * Apply styles to cells
     * @private
     */
    _applyStyles(worksheet, range, styles) {
        if (!styles || Object.keys(styles).length === 0) return;

        const {
            backgroundColor,
            textColor,
            bold = false,
            italic = false,
            fontSize = 11,
            horizontalAlign = 'left',
            verticalAlign = 'center'
        } = styles;

        const cellStyle = {};

        // Font
        cellStyle.font = {
            sz: fontSize
        };

        if (textColor) {
            cellStyle.font.color = { rgb: this._normalizeColor(textColor) };
        }
        if (bold) {
            cellStyle.font.bold = true;
        }
        if (italic) {
            cellStyle.font.italic = true;
        }

        // Background Color
        if (backgroundColor) {
            cellStyle.fill = {
                patternType: 'solid',
                fgColor: { rgb: this._normalizeColor(backgroundColor) },
                bgColor: { rgb: this._normalizeColor(backgroundColor) }
            };
        }

        // Alignment
        cellStyle.alignment = {
            horizontal: horizontalAlign,
            vertical: verticalAlign
        };

        // Apply styles to each cell in the range
        for (let row = range.s.r; row <= range.e.r; row++) {
            for (let col = range.s.c; col <= range.e.c; col++) {
                const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });

                if (!worksheet[cellAddress]) continue;

                worksheet[cellAddress].s = { ...cellStyle };
            }
        }
    }

    /**
     * Normalize color (convert different formats to RGB hex)
     * @private
     */
    _normalizeColor(color) {
        if (!color) return null;

        // If it's hex without #
        if (/^[0-9A-F]{6}$/i.test(color)) {
            return color.toUpperCase();
        }

        // If hex with #
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            return color.substring(1).toUpperCase();
        }

        // Predefined colors
        const colorMap = {
            'black': '000000',
            'white': 'FFFFFF',
            'red': 'FF0000',
            'green': '00FF00',
            'blue': '0000FF',
            'yellow': 'FFFF00',
            'orange': 'FFA500',
            'purple': '800080',
            'gray': '808080',
            'grey': '808080'
        };

        return colorMap[color.toLowerCase()] || '000000';
    }

    /**
     * Write data as an array of arrays (rows)
     * @param {string} sheetName - sheet name
     * @param {Array} data - array of arrays [[row1], [row2], ...]
     * @param {Object} options - write options
     * @param {number} options.startRow - starting row (default: 0)
     * @param {number} options.startCol - starting column (default: 0)
     * @param {boolean} options.autoFitColumns - automatically adjust column width (default: false)
     * @param {Object} options.headerStyle - styles for the first row (headers)
     * @param {Object} options.dataStyle - styles for all data
     * @param {Array<number>} options.columnWidths - array of manual column widths
     */
    writeArrayToSheet(sheetName, data, options = {}) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const {
            startRow = 0,
            startCol = 0,
            autoFitColumns = false,
            headerStyle = null,
            dataStyle = null,
            columnWidths = null
        } = options;

        // If the sheet does not exist, create it
        if (!this.workbook.Sheets[sheetName]) {
            this.createSheet(sheetName);
        }

        const worksheet = this.workbook.Sheets[sheetName];

        // We record data starting from the specified position
        XLSX.utils.sheet_add_aoa(worksheet, data, {
            origin: { r: startRow, c: startCol }
        });

        // Automatic column width adjustment
        if (autoFitColumns) {
            this._autoFitColumns(worksheet, data);
        }

        // Set the column width manually
        if (columnWidths && Array.isArray(columnWidths)) {
            worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
        }

        // Applying styles to headings (first line)
        if (headerStyle && data.length > 0) {
            const headerRange = {
                s: { r: startRow, c: startCol },
                e: { r: startRow, c: startCol + data[0].length - 1 }
            };
            this._applyStyles(worksheet, headerRange, headerStyle);
        }

        // Apply styles to all data
        if (dataStyle && data.length > 0) {
            const dataRange = {
                s: { r: startRow, c: startCol },
                e: { r: startRow + data.length - 1, c: startCol + data[0].length - 1 }
            };
            this._applyStyles(worksheet, dataRange, dataStyle);
        }

        return this;
    }

    /**
     * Write data as an array of objects (with automatic headers)
     * @param {string} sheetName - sheet name
     * @param {Array} data - array of objects [{col1: val1, col2: val2}, ...]
     * @param {Object} options - write options
     * @param {number} options.startRow - starting row (default: 0)
     * @param {Array} options.headers - array of column headers
     * @param {boolean} options.autoFitColumns - automatically adjust column width (default: false)
     * @param {Object} options.headerStyle - styles for header row
     * @param {Object} options.dataStyle - styles for all data
     * @param {Array<number>} options.columnWidths - array of manual column widths
     */
    writeObjectsToSheet(sheetName, data, options = {}) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const {
            startRow = 0,
            headers = null,
            autoFitColumns = false,
            headerStyle = null,
            dataStyle = null,
            columnWidths = null
        } = options;

        // If the sheet does not exist, create it
        if (!this.workbook.Sheets[sheetName]) {
            this.createSheet(sheetName, []);
        }

        const worksheet = this.workbook.Sheets[sheetName];

        // We save the data as JSON
        XLSX.utils.sheet_add_json(worksheet, data, {
            origin: startRow,
            header: headers,
            skipHeader: false
        });

        // Convert objects into an array of arrays for width processing
        const keys = headers || Object.keys(data[0] || {});
        const arrayData = [
            keys,
            ...data.map(row => keys.map(key => row[key]))
        ];

        // Automatic column width adjustment
        if (autoFitColumns) {
            this._autoFitColumns(worksheet, arrayData);
        }

        // Set the column width manually
        if (columnWidths && Array.isArray(columnWidths)) {
            worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));
        }

        // Applying styles to headings
        if (headerStyle) {
            const headerRange = {
                s: { r: startRow, c: 0 },
                e: { r: startRow, c: keys.length - 1 }
            };
            this._applyStyles(worksheet, headerRange, headerStyle);
        }

        // Applying styles to data (without headers)
        if (dataStyle && data.length > 0) {
            const dataRange = {
                s: { r: startRow + 1, c: 0 },
                e: { r: startRow + data.length, c: keys.length - 1 }
            };
            this._applyStyles(worksheet, dataRange, dataStyle);
        }

        return this;
    }

    /**
     * Read data from a sheet as an array of arrays
     */
    readSheetAsArray(sheetName, options = {}) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        if (!this.workbook.Sheets[sheetName]) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }

        const worksheet = this.workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(worksheet, { header: 1, ...options });
    }

    /**
     * Read data from a sheet as an array of objects
     */
    readSheetAsObjects(sheetName, options = {}) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        if (!this.workbook.Sheets[sheetName]) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }

        const worksheet = this.workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(worksheet, options);
    }

    /**
     * Clear sheet
     */
    clearSheet(sheetName) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        if (!this.workbook.Sheets[sheetName]) {
            throw new Error(`Sheet "${sheetName}" not found`);
        }

        this.workbook.Sheets[sheetName] = XLSX.utils.aoa_to_sheet([]);
        return this;
    }

    /**
     * Rename sheet
     */
    renameSheet(oldName, newName) {
        if (!this.workbook) {
            throw new Error('Workbook not initialized');
        }

        const index = this.workbook.SheetNames.indexOf(oldName);
        if (index === -1) {
            throw new Error(`Sheet "${oldName}" not found`);
        }

        this.workbook.SheetNames[index] = newName;
        this.workbook.Sheets[newName] = this.workbook.Sheets[oldName];
        delete this.workbook.Sheets[oldName];

        return this;
    }
}
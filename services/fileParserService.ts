import { DataRecord, FileData } from '../types';

declare var XLSX: any; // Loaded from CDN

export const parseFile = async (file: File): Promise<FileData> => {
  try {
    const fileBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Use sheet_to_json with header: 1 to get arrays of arrays
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

    if (jsonData.length === 0) {
      return { name: file.name, records: [], headers: [] };
    }

    // First row is headers
    const headers: string[] = jsonData[0].map(String);
    let records: DataRecord[] = jsonData.slice(1).map(rowArray => {
      const record: DataRecord = {};
      headers.forEach((header, index) => {
        // Ensure value is a string and handle undefined/null
        record[header] = rowArray[index] !== undefined && rowArray[index] !== null ? String(rowArray[index]) : '';
      });
      return record;
    });

    // Filter out records where all values are empty strings
    records = records.filter(record => 
        Object.values(record).some(value => value !== undefined && String(value).trim() !== '')
    );

    return { name: file.name, records, headers };
  } catch (error) {
    console.error("Error parsing file:", error);
    throw new Error(`Error parsing file: ${error instanceof Error ? error.message : String(error)}`);
  }
};

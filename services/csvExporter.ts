import { MappedRecord, ShoryColumnConfig, ICColumnConfig } from '../types';

export const downloadCSV = (data: MappedRecord[], shoryConfig: ShoryColumnConfig, icConfig: ICColumnConfig, filename: string = 'mapped_results.csv'): void => {
  if (data.length === 0) return;

  const shoryOutputCols = shoryConfig.outputColumns.filter(c => c !== shoryConfig.make && c !== shoryConfig.model);
  
  const icCodeHeaders = icConfig.codes.map(codeCol => `Matched IC ${codeCol}`);

  const headers = [
    `Shory ${shoryConfig.make}`, 
    `Shory ${shoryConfig.model}`, 
    ...shoryOutputCols, 
    'Matched IC Make', 
    'Matched IC Model', 
    ...icCodeHeaders,
    'Match Status', 
    'Match Confidence (%)', 
    'Actual Fuzzy Score (%)', 
    'AI Match Reason',
    'All Semantic Matches',
    'Sources'
  ];
  
  const csvRows = [headers.join(',')];

  data.forEach(row => {
    const icCodeValues = icConfig.codes.map(codeCol => 
      `"${((row.matchedICCodes && row.matchedICCodes[codeCol]) || '').replace(/"/g, '""')}"`
    );

    const semanticMatchesValue = `"${(row.allSemanticMatches || []).join(', ').replace(/"/g, '""')}"`;
    const sourcesValue = `"${(row.groundingSources || []).map(s => s.uri).join(', ').replace(/"/g, '""')}"`;

    const values = [
      `"${String(row[shoryConfig.make] ?? '').replace(/"/g, '""')}"`,
      `"${String(row[shoryConfig.model] ?? '').replace(/"/g, '""')}"`,
      ...shoryOutputCols.map(col => `"${String(row[col] ?? '').replace(/"/g, '""')}"`),
      `"${(row.matchedICMake || '').replace(/"/g, '""')}"`,
      `"${(row.matchedICModel || '').replace(/"/g, '""')}"`,
      ...icCodeValues,
      `"${row.matchStatus.replace(/"/g, '""')}"`,
      `"${(row.matchConfidence !== undefined ? (row.matchConfidence * 100).toFixed(0) + '%' : '').replace(/"/g, '""')}"`,
      `"${(row.actualFuzzyScore !== undefined ? (row.actualFuzzyScore * 100).toFixed(0) + '%' : '-').replace(/"/g, '""')}"`, 
      `"${(row.aiReason || '').replace(/"/g, '""')}"`,
      semanticMatchesValue,
      sourcesValue
    ];
    csvRows.push(values.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

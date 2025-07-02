import React from 'react';
import { MappedRecord, MatchStatus } from '../types';
import { CheckIcon, AlertTriangleIcon, InfoIcon, CircleDotIcon, CircleIcon as StatusCircleIcon, BrainIcon, GitBranchIcon, LinkIcon } from './Icons'; 

interface ResultsTableProps {
  data: MappedRecord[];
  shoryOutputColumns: string[]; 
  shoryMakeColumn: string;
  shoryModelColumn: string;
  icCodeColumns: string[]; 
}

const ResultsTable: React.FC<ResultsTableProps> = ({ data, shoryOutputColumns, shoryMakeColumn, shoryModelColumn, icCodeColumns }) => {
  if (!data.length) {
    return <div className="text-center text-muted-foreground py-20 bg-card rounded-xl shadow-fluid-sm border border-border">
        <InfoIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" />
        <p className="text-lg font-medium">No Mapped Data</p>
        <p className="text-sm">The mapping process has not produced any results to display yet.</p>
    </div>;
  }

  // Shadcn-inspired subtle status indicators
  const getStatusInfo = (status: MatchStatus): { textClass: string; icon?: React.ReactNode; label: string } => {
    switch (status) {
      case MatchStatus.MATCHED_KNOWLEDGE:
        return { textClass: 'text-purple-600', icon: <BrainIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Matched (Knowledge)' };
      case MatchStatus.MATCHED_RULE:
        return { textClass: 'text-teal-600', icon: <GitBranchIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Matched (Learned Rule)' };
      case MatchStatus.MATCHED_FUZZY:
        return { textClass: 'text-green-600', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Matched (Fuzzy)' };
      case MatchStatus.MATCHED_AI:
        return { textClass: 'text-sky-600', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Matched (AI)' }; 
      case MatchStatus.MATCHED_SEMANTIC_LLM:
        return { textClass: 'text-primary', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Matched (Semantic LLM)' };
      case MatchStatus.NO_MATCH:
        return { textClass: 'text-orange-600', icon: <AlertTriangleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: status }; 
      case MatchStatus.PROCESSING_AI:
      case MatchStatus.PROCESSING_SEMANTIC_LLM:
        return { textClass: 'text-secondary-foreground animate-pulse', icon: <CircleDotIcon className="w-3 h-3 mr-1.5 flex-shrink-0 text-secondary" />, label: status };
      case MatchStatus.ERROR_AI:
        return { textClass: 'text-destructive', icon: <AlertTriangleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: status };
      default:
        return { textClass: 'text-muted-foreground', icon: <StatusCircleIcon className="w-3 h-3 mr-1.5 flex-shrink-0" />, label: status };
    }
  };

  const uniqueShoryOutputColumns = shoryOutputColumns.filter(
    col => col !== shoryMakeColumn && col !== shoryModelColumn
  );

  const icCodeHeaders = icCodeColumns.map(codeCol => `IC ${codeCol}`);

  const allHeaders = [
    `Shory ${shoryMakeColumn}`,
    `Shory ${shoryModelColumn}`,
    ...uniqueShoryOutputColumns,
    'Matched IC Make',
    'Matched IC Model',
    ...icCodeHeaders,
    'Match Status',
    'Confidence', 
    'Fuzzy Score', 
    'AI Reason',
    'All Semantic Matches',
    'Sources'
  ].map(header => ({
    key: header.replace(/\s+/g, '-').toLowerCase(),
    title: header
  }));

  return (
    <div className="overflow-x-auto border border-border rounded-xl shadow-fluid-sm bg-card">
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/60"> {/* Shadcn table head often slightly muted */}
          <tr>
            {allHeaders.map(header => (
              <th
                key={header.key}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap" // Adjusted padding and font
              >
                {header.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {data.map((row) => {
            const statusInfo = getStatusInfo(row.matchStatus);
            return (
              <tr key={row.__id} className="hover:bg-muted/50 transition-colors duration-150 ease-in-out">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{String(row[shoryMakeColumn] ?? '–')}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{String(row[shoryModelColumn] ?? '–')}</td>
                {uniqueShoryOutputColumns.map(col => (
                   <td key={`${row.__id}-${col}`} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                     {String(row[col] ?? '–')}
                   </td>
                ))}
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{row.matchedICMake || '–'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{row.matchedICModel || '–'}</td>
                {icCodeColumns.map(codeCol => (
                  <td key={`${row.__id}-iccode-${codeCol}`} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">
                    {(row.matchedICCodes && row.matchedICCodes[codeCol] ? row.matchedICCodes[codeCol] : '–')}
                  </td>
                ))}
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  <span className={`inline-flex items-center text-xs font-medium ${statusInfo.textClass}`}>
                    {statusInfo.icon}
                    {statusInfo.label}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground text-center">
                  {row.matchConfidence ? (row.matchConfidence * 100).toFixed(0) + '%' : '–'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground text-center"> 
                  {row.actualFuzzyScore !== undefined ? (row.actualFuzzyScore * 100).toFixed(0) + '%' : '–'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed"> {/* Max width for AI reason */}
                  {row.aiReason || '–'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed">
                  {(row.allSemanticMatches && row.allSemanticMatches.length > 0) ? row.allSemanticMatches.join(', ') : '–'}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed">
                  {row.groundingSources && row.groundingSources.length > 0 ? (
                    <ul className="space-y-1">
                      {row.groundingSources.map((source, index) => (
                        <li key={index} className="flex items-start">
                          <LinkIcon className="w-3 h-3 mr-1.5 mt-0.5 text-primary flex-shrink-0" />
                          <a href={source.uri} target="_blank" rel="noopener noreferrer" title={source.title} className="hover:underline hover:text-primary transition-colors truncate">
                            {source.title || source.uri}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    '–'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ResultsTable;
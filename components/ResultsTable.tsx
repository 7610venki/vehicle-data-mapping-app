
import React from 'react';
import { MappedRecord, MatchStatus } from '../types';
import { CheckIcon, AlertTriangleIcon, InfoIcon, CircleDotIcon, CircleIcon as StatusCircleIcon, BrainIcon, GitBranchIcon, LinkIcon } from './Icons'; 
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './Card';
import { cn } from '../lib/utils';

interface ResultsTableProps {
  data: MappedRecord[];
  shoryOutputColumns: string[]; 
  shoryMakeColumn: string;
  shoryModelColumn: string;
  icCodeColumns: string[]; 
}

const getStatusInfo = (status: MatchStatus): { textClass: string; icon?: React.ReactNode; label: string } => {
    switch (status) {
      case MatchStatus.MATCHED_KNOWLEDGE:
        return { textClass: 'text-purple-600', icon: <BrainIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Knowledge' };
      case MatchStatus.MATCHED_RULE:
        return { textClass: 'text-teal-600', icon: <GitBranchIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Rule' };
      case MatchStatus.MATCHED_FUZZY:
        return { textClass: 'text-green-600', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Fuzzy' };
      case MatchStatus.MATCHED_AI:
        return { textClass: 'text-sky-600', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'AI Web' }; 
      case MatchStatus.MATCHED_SEMANTIC_LLM:
        return { textClass: 'text-primary', icon: <CheckIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'AI Semantic' };
      case MatchStatus.NO_MATCH:
        return { textClass: 'text-orange-600', icon: <AlertTriangleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'No Match' }; 
      case MatchStatus.PROCESSING_AI:
      case MatchStatus.PROCESSING_SEMANTIC_LLM:
        return { textClass: 'text-secondary-foreground animate-pulse', icon: <CircleDotIcon className="w-3 h-3 mr-1.5 flex-shrink-0 text-secondary" />, label: 'Processing' };
      case MatchStatus.ERROR_AI:
        return { textClass: 'text-destructive', icon: <AlertTriangleIcon className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" />, label: 'Error' };
      default:
        return { textClass: 'text-muted-foreground', icon: <StatusCircleIcon className="w-3 h-3 mr-1.5 flex-shrink-0" />, label: status };
    }
};

const DataRow = ({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) => (
    <div className={cn("flex justify-between items-start gap-2", className)}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-sm text-right text-foreground font-medium">{value || '–'}</p>
    </div>
);

const ResultsTable: React.FC<ResultsTableProps> = ({ data, shoryOutputColumns, shoryMakeColumn, shoryModelColumn, icCodeColumns }) => {
  if (!data.length) {
    return <div className="text-center text-muted-foreground py-20 bg-card rounded-xl shadow-fluid-sm border border-border">
        <InfoIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground/60" />
        <p className="text-lg font-medium">No Mapped Data</p>
        <p className="text-sm">The mapping process has not produced any results to display yet.</p>
    </div>;
  }

  const uniqueShoryOutputColumns = shoryOutputColumns.filter(col => col !== shoryMakeColumn && col !== shoryModelColumn);
  const icCodeHeaders = icCodeColumns.map(codeCol => `IC ${codeCol}`);

  const allHeaders = [ `Shory ${shoryMakeColumn}`, `Shory ${shoryModelColumn}`, ...uniqueShoryOutputColumns, 'Matched IC Make', 'Matched IC Model', ...icCodeHeaders, 'Match Status', 'Confidence', 'Fuzzy Score', 'AI Reason', 'All Semantic Matches', 'Sources'
  ].map(header => ({ key: header.replace(/\s+/g, '-').toLowerCase(), title: header }));

  return (
    <div>
        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
            {data.map((row) => {
                const statusInfo = getStatusInfo(row.matchStatus);
                return (
                    <Card key={row.__id} className="shadow-fluid-md">
                        <CardHeader className="pb-4">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-lg leading-tight">
                                    {String(row[shoryMakeColumn] ?? '')} <span className="font-normal text-muted-foreground">{String(row[shoryModelColumn] ?? '')}</span>
                                </CardTitle>
                                <span className={cn("inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full", statusInfo.textClass, statusInfo.textClass.replace('text-','bg-') + '/10' )}>
                                    {statusInfo.icon} {statusInfo.label}
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="p-3 bg-muted/60 rounded-lg space-y-2">
                                <DataRow label="Matched Make" value={row.matchedICMake} />
                                <DataRow label="Matched Model" value={row.matchedICModel} />
                                {icCodeColumns.map(codeCol => (
                                    <DataRow key={`${row.__id}-m-iccode-${codeCol}`} label={`IC ${codeCol}`} value={row.matchedICCodes?.[codeCol]} />
                                ))}
                            </div>
                            <div className="p-3 bg-muted/60 rounded-lg space-y-2">
                                <DataRow label="Confidence" value={row.matchConfidence ? `${(row.matchConfidence * 100).toFixed(0)}%` : '–'} />
                                <DataRow label="Fuzzy Score" value={row.actualFuzzyScore !== undefined ? `${(row.actualFuzzyScore * 100).toFixed(0)}%` : '–'} />
                            </div>
                             {row.aiReason && (
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">AI Reason</p>
                                    <p className="text-sm text-foreground">{row.aiReason}</p>
                                </div>
                            )}
                            {row.groundingSources && row.groundingSources.length > 0 && (
                                <div className="space-y-1">
                                    <p className="text-sm text-muted-foreground">Sources</p>
                                    <ul className="space-y-1 text-sm">
                                      {row.groundingSources.map((source, index) => (
                                        <li key={index} className="flex items-start text-primary"><LinkIcon className="w-3 h-3 mr-1.5 mt-1 flex-shrink-0" /><a href={source.uri} target="_blank" rel="noopener noreferrer" title={source.title} className="hover:underline truncate">{source.title || source.uri}</a></li>
                                      ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                );
            })}
        </div>
        
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto border border-border rounded-xl shadow-fluid-sm bg-card">
            <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/60">
                <tr>
                    {allHeaders.map(header => ( <th key={header.key} scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{header.title}</th> ))}
                </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                {data.map((row) => {
                    const statusInfo = getStatusInfo(row.matchStatus);
                    return (
                    <tr key={row.__id} className="hover:bg-muted/50 transition-colors duration-150 ease-in-out">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{String(row[shoryMakeColumn] ?? '–')}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{String(row[shoryModelColumn] ?? '–')}</td>
                        {uniqueShoryOutputColumns.map(col => ( <td key={`${row.__id}-${col}`} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{String(row[col] ?? '–')}</td> ))}
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{row.matchedICMake || '–'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{row.matchedICModel || '–'}</td>
                        {icCodeColumns.map(codeCol => ( <td key={`${row.__id}-iccode-${codeCol}`} className="px-4 py-3 whitespace-nowrap text-sm text-foreground">{(row.matchedICCodes?.[codeCol] || '–')}</td>))}
                        <td className="px-4 py-3 whitespace-nowrap text-sm"><span className={`inline-flex items-center text-xs font-medium ${statusInfo.textClass}`}>{statusInfo.icon}{statusInfo.label}</span></td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground text-center">{row.matchConfidence ? (row.matchConfidence * 100).toFixed(0) + '%' : '–'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-foreground text-center">{row.actualFuzzyScore !== undefined ? (row.actualFuzzyScore * 100).toFixed(0) + '%' : '–'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed">{row.aiReason || '–'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed">{(row.allSemanticMatches?.length > 0) ? row.allSemanticMatches.join(', ') : '–'}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[250px] break-words whitespace-normal leading-relaxed">
                        {row.groundingSources?.length > 0 ? (
                            <ul className="space-y-1">{row.groundingSources.map((source, index) => ( <li key={index} className="flex items-start"><LinkIcon className="w-3 h-3 mr-1.5 mt-0.5 text-primary flex-shrink-0" /><a href={source.uri} target="_blank" rel="noopener noreferrer" title={source.title} className="hover:underline hover:text-primary transition-colors truncate">{source.title || source.uri}</a></li>))}</ul>
                        ) : '–'}
                        </td>
                    </tr>
                    );
                })}
                </tbody>
            </table>
        </div>
    </div>
  );
};

export default ResultsTable;

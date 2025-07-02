
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './Card';

interface ColumnSelectorProps {
  headers: string[];
  selectedMake: string;
  selectedModel: string;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
  idPrefix: string;
  title: string;
  selectedCodes?: string[];
  onCodesChange?: (codes: string[]) => void;
  additionalColumns?: string[];
  selectedAdditionalColumns?: string[];
  onAdditionalColumnsChange?: (columns: string[]) => void;
}

const ColumnSelector: React.FC<ColumnSelectorProps> = ({
  headers,
  selectedMake,
  selectedModel,
  onMakeChange,
  onModelChange,
  idPrefix,
  title,
  selectedCodes,
  onCodesChange,
  additionalColumns,
  selectedAdditionalColumns,
  onAdditionalColumnsChange,
}) => {
  const handleToggle = (column: string, currentSelected: string[] | undefined, setter: ((cols: string[]) => void) | undefined) => {
    if (setter && currentSelected) {
      const currentIndex = currentSelected.indexOf(column);
      const newSelected = [...currentSelected];
      if (currentIndex === -1) {
        newSelected.push(column);
      } else {
        newSelected.splice(currentIndex, 1);
      }
      setter(newSelected);
    }
  };

  const renderSelect = (id: string, value: string, onChange: (val: string) => void, label: string, description?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-select mt-1 block w-full shadow-sm" // Uses global form-select style
      >
        <option value="" disabled>-- Select Column --</option>
        {headers.map((header) => (
          <option key={`${id}-${header}`} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );

  const renderCheckboxGroup = (
    groupTitle: string,
    allOptions: string[],
    selectedOptions: string[] | undefined,
    onToggle: (option: string) => void,
    filterOut: string[] = [],
    description?: string,
  ) => (
    <div className="space-y-2 pt-2">
      <h4 className="text-sm font-semibold text-foreground">{groupTitle}</h4>
      {description && <p className="text-xs text-muted-foreground -mt-1.5 mb-2">{description}</p>}
      <div className="max-h-60 overflow-y-auto p-1 border border-border rounded-lg bg-muted/50 space-y-1 shadow-inner">
        {allOptions.length === 0 && <p className="text-xs text-muted-foreground p-3 text-center">No columns available.</p>}
        {allOptions.filter(opt => !filterOut.includes(opt)).map((col) => (
          <label key={`${idPrefix}-${groupTitle.replace(/\s+/g, '-')}-${col}`} 
                 htmlFor={`${idPrefix}-${groupTitle.replace(/\s+/g, '-')}-${col}`}
                 className="flex items-center space-x-3 p-2.5 rounded-md hover:bg-card/80 transition-colors duration-150 cursor-pointer group">
            <input
              type="checkbox"
              id={`${idPrefix}-${groupTitle.replace(/\s+/g, '-')}-${col}`}
              checked={selectedOptions?.includes(col)}
              onChange={() => onToggle(col)}
              className="form-checkbox text-primary focus:ring-ring focus:ring-offset-0 focus:ring-1 border-input group-hover:border-primary/50 rounded cursor-pointer" // Uses global form-checkbox style
            />
            <span className="text-sm text-foreground/90 flex-1 group-hover:text-primary">
              {col}
            </span>
          </label>
        ))}
         {allOptions.filter(opt => !filterOut.includes(opt)).length === 0 && allOptions.length > 0 && <p className="text-xs text-muted-foreground p-3 text-center">All available columns are already selected as Make/Model.</p>}
      </div>
    </div>
  );

  return (
    <Card className="shadow-fluid-md border-border">
      <CardHeader>
        <CardTitle>{title}</CardTitle> {/* Removed text-xl to use default from CardTitle */}
        {idPrefix === "shory" && <CardDescription>Map Shory data fields for Make, Model, and choose additional columns for the output.</CardDescription>}
        {idPrefix === "ic" && <CardDescription>Map Insurance Company data fields for Make, Model, and select relevant code columns.</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/60">
          {renderSelect(`${idPrefix}-make`, selectedMake, onMakeChange, "Vehicle Make Column", "Select the column representing the vehicle manufacturer (e.g., Toyota, Ford).")}
          {renderSelect(`${idPrefix}-model`, selectedModel, onModelChange, "Vehicle Model Column", "Select the column representing the vehicle model name (e.g., Camry, F-150).")}
        </div>
        
        {onCodesChange && selectedCodes && (
            <div className="p-4 border border-border rounded-lg bg-muted/60">
                {renderCheckboxGroup(
                    "IC Code Columns (Optional)",
                    headers,
                    selectedCodes,
                    (col) => handleToggle(col, selectedCodes, onCodesChange),
                    [], 
                    "Select any Insurance Company specific code columns you want to include in the final output."
                )}
            </div>
        )}

        {additionalColumns && onAdditionalColumnsChange && selectedAdditionalColumns && (
            <div className="p-4 border border-border rounded-lg bg-muted/60">
            {renderCheckboxGroup(
                "Additional Shory Output Columns",
                additionalColumns,
                selectedAdditionalColumns,
                (col) => handleToggle(col, selectedAdditionalColumns, onAdditionalColumnsChange),
                [selectedMake, selectedModel].filter(Boolean), 
                "Select other columns from the Shory file to include in the final mapped results."
            )}
            </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ColumnSelector;

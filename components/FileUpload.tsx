import React, { useState, useRef } from 'react';
import { UploadCloudIcon, CheckIcon as FileSelectedIcon, ChevronRightIcon } from './Icons';
import ActionButton from './ActionButton';
import { useDialog } from './DialogProvider';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  acceptedFileTypes?: string;
  label: string; // Used for the ActionButton text
  disabled?: boolean;
  id: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ 
  onFileUpload, 
  acceptedFileTypes = ".csv, .xlsx", 
  label, 
  disabled, 
  id 
}) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { alert } = useDialog();

  const handleFileButtonClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onFileUpload(file);
    } else {
      setFileName(null);
    }
    // Reset input value to allow re-uploading the same file if needed
    if (event.target) {
        event.target.value = ''; 
    }
  };
  
  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    if (file && (acceptedFileTypes.split(',').some(type => file.type.includes(type.trim().replace('.', ''))) || acceptedFileTypes.split(',').some(type => file.name.endsWith(type.trim())) ) ) {
      setFileName(file.name);
      onFileUpload(file);
      if(inputRef.current) inputRef.current.files = event.dataTransfer.files;
    } else if (file) {
        await alert({
            title: 'Invalid File Type',
            message: `Please upload a file of one of the following types: ${acceptedFileTypes}.`,
            confirmText: 'OK',
        });
        setFileName(null);
    } else {
        setFileName(null);
    }
  };
  
  let statusText = "Or drag and drop your file here";
  let statusTextColor = "text-muted-foreground";
  if (isDragging) {
    statusText = "Drop file to upload";
    statusTextColor = "text-primary font-medium";
  } else if (fileName) {
    statusText = `Selected: ${fileName}`;
    statusTextColor = "text-green-600 font-medium";
  }

  return (
    <div className="w-full space-y-4">
      <ActionButton 
        onClick={handleFileButtonClick} 
        disabled={disabled}
        className="w-full sm:w-auto"
      >
        {fileName ? 'Change File' : label}
      </ActionButton>

      <div // This div acts as the label for drag-and-drop
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileButtonClick} // Allow clicking the area to also open dialog
        className={`relative flex items-center w-full min-h-[120px] p-6 transition-all duration-200 ease-in-out bg-card border-2 border-dashed rounded-xl group
                    ${disabled ? 'opacity-60 cursor-not-allowed bg-muted/70 border-border' : 
                                 isDragging ? 'border-primary bg-primary/10 shadow-fluid-md scale-[1.01]' : 
                                             'cursor-pointer border-border hover:border-primary/60 focus-within:ring-1 focus-within:ring-ring focus-within:border-primary'}`}
        // Removed htmlFor as click is handled by parent div or button
      >
        <div className="flex-shrink-0 w-8 mr-4 space-y-1">
          <ChevronRightIcon className="w-5 h-5 text-muted-foreground/50 opacity-70 group-hover:text-muted-foreground/70" />
          <ChevronRightIcon className="w-5 h-5 text-muted-foreground/50 opacity-70 group-hover:text-muted-foreground/70" />
        </div>
        <div className="flex-1 text-left">
          <p className={`text-sm sm:text-base transition-colors duration-200 ${statusTextColor}`}>
            {statusText}
          </p>
          {!fileName && !isDragging && (
             <p className="mt-1 text-xs text-muted-foreground/80">
                Accepted types: {acceptedFileTypes.toUpperCase()}
             </p>
          )}
           {fileName && !isDragging && (
             <p className="mt-1 text-xs text-muted-foreground/80">
                Click "{fileName ? 'Change File' : label}" or drop another file to replace.
             </p>
          )}
        </div>
        {/* Visual cue for success when a file is selected */}
        {fileName && !isDragging && (
          <FileSelectedIcon className="w-6 h-6 ml-4 text-green-500 flex-shrink-0" />
        )}
         {!fileName && !isDragging && (
          <UploadCloudIcon className="w-8 h-8 ml-4 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors flex-shrink-0" />
        )}
      </div>
      <input
        ref={inputRef}
        id={id} // ID still needed if there's an external label somewhere, or for testing
        type="file"
        disabled={disabled}
        onChange={handleFileChange}
        accept={acceptedFileTypes}
        className="sr-only"
      />
    </div>
  );
};

export default FileUpload;

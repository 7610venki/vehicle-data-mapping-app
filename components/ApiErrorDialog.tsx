
import React from 'react';
import { ApiErrorDetail } from '../services/apiErrorData';

interface ApiErrorDialogProps {
  errorDetail: ApiErrorDetail;
}

const ApiErrorDialog: React.FC<ApiErrorDialogProps> = ({ errorDetail }) => {
  return (
    <div className="text-left space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 gap-y-3 text-sm">
        <strong className="text-muted-foreground pt-1">HTTP Code:</strong>
        <code className="font-mono bg-muted text-muted-foreground px-2 py-1 rounded-md text-xs self-center">{errorDetail.code}</code>

        <strong className="text-muted-foreground pt-1">Status:</strong>
        <code className="font-mono bg-muted text-muted-foreground px-2 py-1 rounded-md text-xs self-center">{errorDetail.status}</code>
        
        <strong className="text-muted-foreground col-span-2 pt-2 border-t border-border mt-2">Description:</strong>
        <p className="col-span-2 text-foreground/90">{errorDetail.description}</p>
        
        <strong className="text-muted-foreground col-span-2 pt-2 border-t border-border mt-2">Example:</strong>
        <p className="col-span-2 text-foreground/90">{errorDetail.example}</p>

        <strong className="text-muted-foreground col-span-2 pt-2 border-t border-border mt-2">Suggested Solution:</strong>
        <p className="col-span-2 text-foreground/90" dangerouslySetInnerHTML={{ __html: errorDetail.solution }} />
      </div>
    </div>
  );
};

export default ApiErrorDialog;

import React from 'react';
import { MappingSession } from '../types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import { FolderOpenIcon, TrashIcon, ArrowRightIcon } from './Icons';
import Alert from './Alert';
import ActionButton from './ActionButton';
import { useDialog } from './DialogProvider';


interface SessionManagerProps {
  sessions: MappingSession[];
  onLoad: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onNewSession: () => void;
}

const SessionManager: React.FC<SessionManagerProps> = ({ sessions, onLoad, onDelete, onNewSession }) => {
  const { confirm } = useDialog();

  const handleDeleteClick = async (sessionId: string, sessionName: string) => {
    const wasConfirmed = await confirm({
        title: 'Delete Session?',
        message: `Are you sure you want to delete the session "${sessionName}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive'
    });

    if (wasConfirmed) {
        onDelete(sessionId);
    }
  };

  return (
    <Card className="shadow-fluid-md animate-fadeIn">
      <CardHeader>
        <CardTitle>Welcome Back!</CardTitle>
        <CardDescription>
          {sessions.length > 0 ? 'You can load a previous session or start a new one.' : 'Start a new mapping session to begin.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <Alert variant="info" title="No Saved Sessions">
            Your saved mapping sessions will appear here once you save them.
          </Alert>
        ) : (
          <div className="border border-border rounded-lg max-h-[50vh] overflow-y-auto">
            <ul className="divide-y divide-border">
              {sessions.map(session => (
                <li key={session.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-foreground truncate">{session.name}</p>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <p>Saved: {new Date(session.createdAt).toLocaleString()}</p>
                        <p className="truncate">Files: {session.shoryFile.name} & {session.icFile.name}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <ActionButton
                      variant="outline"
                      size="sm"
                      onClick={() => onLoad(session.id)}
                      icon={<FolderOpenIcon />}
                    >
                      Load
                    </ActionButton>
                    <ActionButton
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteClick(session.id, session.name)}
                      className="bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20"
                      icon={<TrashIcon />}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t border-border">
         <ActionButton 
            onClick={onNewSession} 
            variant="primary" 
            icon={<ArrowRightIcon />}
            iconPosition="right"
            className="w-full sm:w-auto"
        >
            Start New Mapping Session
        </ActionButton>
      </CardFooter>
    </Card>
  );
};

export default SessionManager;
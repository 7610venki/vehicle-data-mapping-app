import React, { useState, useCallback, createContext, useContext, ReactNode } from 'react';
import Dialog from './Dialog';

export interface DialogOptions {
  type?: 'alert' | 'confirm' | 'prompt';
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  defaultValue?: string;
  variant?: 'primary' | 'destructive';
}

type DialogContextType = {
  alert: (options: Omit<DialogOptions, 'type'>) => Promise<void>;
  confirm: (options: Omit<DialogOptions, 'type'>) => Promise<boolean>;
  prompt: (options: Omit<DialogOptions, 'type'>) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = (): DialogContextType => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

// Promise resolver type
type PromiseResolver = {
  resolve: (value: any) => void;
  reject: () => void;
};

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<DialogOptions>({ title: '', message: '' });
  const [resolver, setResolver] = useState<PromiseResolver | null>(null);

  const showDialog = useCallback((opts: DialogOptions): Promise<string | boolean | void> => {
    return new Promise((resolve, reject) => {
      setOptions(opts);
      setResolver({ resolve, reject });
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = (value?: string) => {
    if (resolver) {
      resolver.resolve(value ?? true);
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (resolver) {
      if (options.type === 'prompt') {
        resolver.resolve(null);
      } else {
        resolver.resolve(false);
      }
    }
    setIsOpen(false);
  };

  const alert = useCallback(
    async (opts: Omit<DialogOptions, 'type'>): Promise<void> => {
      await showDialog({ ...opts, type: 'alert' });
    },
    [showDialog]
  );

  const confirm = useCallback(
    async (opts: Omit<DialogOptions, 'type'>): Promise<boolean> => {
      return (await showDialog({ ...opts, type: 'confirm' })) as boolean;
    },
    [showDialog]
  );

  const prompt = useCallback(
    async (opts: Omit<DialogOptions, 'type'>): Promise<string | null> => {
      return (await showDialog({ ...opts, type: 'prompt' })) as string | null;
    },
    [showDialog]
  );

  const contextValue: DialogContextType = { alert, confirm, prompt };

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      <Dialog isOpen={isOpen} options={options} onConfirm={handleConfirm} onCancel={handleCancel} />
    </DialogContext.Provider>
  );
};

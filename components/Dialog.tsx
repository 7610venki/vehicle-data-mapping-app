import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DialogOptions } from './DialogProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import ActionButton from './ActionButton';

interface DialogProps {
  isOpen: boolean;
  options: DialogOptions;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

const Dialog: React.FC<DialogProps> = ({ isOpen, options, onConfirm, onCancel }) => {
  const {
    type = 'alert',
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel',
    defaultValue = '',
    variant = 'primary',
  } = options;

  const [inputValue, setInputValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (type === 'prompt' && isOpen) {
        setInputValue(defaultValue);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 100); // Short delay to allow for transition
    }
  }, [isOpen, type, defaultValue]);

  const handleConfirm = () => {
    onConfirm(type === 'prompt' ? inputValue : undefined);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onMouseDown={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="w-full max-w-md"
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside the dialog
          >
            <Card className="shadow-fluid-md">
              <CardHeader>
                {title && <CardTitle>{title}</CardTitle>}
                {message && <CardDescription className="pt-2 text-base text-muted-foreground">{message}</CardDescription>}
              </CardHeader>
              {type === 'prompt' && (
                <CardContent className="-mt-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="form-input w-full"
                  />
                </CardContent>
              )}
              <CardFooter className="justify-end gap-3">
                {type !== 'alert' && (
                  <ActionButton variant="outline" onClick={onCancel}>
                    {cancelText}
                  </ActionButton>
                )}
                <ActionButton variant={variant === 'destructive' ? 'destructive' : 'primary'} onClick={handleConfirm}>
                  {confirmText}
                </ActionButton>
              </CardFooter>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Dialog;

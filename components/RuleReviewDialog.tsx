import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LearnedRule, RuleStatus } from '../types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import ActionButton from './ActionButton';
import { TrashIcon } from './Icons';

interface RuleReviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  rules: LearnedRule[];
  onSave: (approvedRules: LearnedRule[], rejectedRuleIds: string[]) => void;
  title: string;
  description: string;
}

const RuleReviewDialog: React.FC<RuleReviewDialogProps> = ({ isOpen, onClose, rules, onSave, title, description }) => {
  const [rulesToDelete, setRulesToDelete] = useState<Set<string>>(new Set());

  const handleToggleRuleDelete = (ruleId: string) => {
    setRulesToDelete(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ruleId)) {
        newSet.delete(ruleId);
      } else {
        newSet.add(ruleId);
      }
      return newSet;
    });
  };

  const handleSave = () => {
    const approvedRules = rules
      .filter(rule => !rulesToDelete.has(rule.id))
      .map(rule => ({ ...rule, status: RuleStatus.APPROVED }));
    const rejectedRuleIds = Array.from(rulesToDelete);
    onSave(approvedRules, rejectedRuleIds);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: -20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="w-full max-w-4xl"
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside the dialog
          >
            <Card className="shadow-fluid-md">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardHeader>
              <CardContent className="max-h-[60vh] overflow-y-auto p-1">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted">
                    <tr>
                      <th scope="col" className="px-6 py-3">Condition(s)</th>
                      <th scope="col" className="px-6 py-3">Action</th>
                      <th scope="col" className="px-6 py-3 text-center">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <tr key={rule.id} className={`border-b ${rulesToDelete.has(rule.id) ? 'bg-red-100/50' : 'bg-background'}`}>
                        <td className="px-6 py-4">
                          {rule.conditions.map((c, i) => (
                            <div key={i} className="font-mono text-xs">
                              <span className="font-semibold">{c.field}</span> {c.operator} <span className="text-blue-600">"{c.value}"</span>
                            </div>
                          ))}
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                          Set Make: <span className="font-semibold">{rule.actions.setMake}</span><br/>
                          Set Model: <span className="font-semibold">{rule.actions.setModel}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <ActionButton
                            variant={rulesToDelete.has(rule.id) ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleToggleRuleDelete(rule.id)}
                          >
                            <TrashIcon className="w-4 h-4" />
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
              <CardFooter>
                <ActionButton variant="outline" onClick={onClose}>Cancel</ActionButton>
                <ActionButton onClick={handleSave}>Save Rules</ActionButton>
              </CardFooter>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RuleReviewDialog;
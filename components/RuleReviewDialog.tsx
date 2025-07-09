import React, { useState } from 'react';
import { LearnedRule, RuleStatus } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './Dialog';
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-1">
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
        </div>
        <DialogFooter>
          <ActionButton variant="outline" onClick={onClose}>Cancel</ActionButton>
          <ActionButton onClick={handleSave}>Save Rules</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RuleReviewDialog;
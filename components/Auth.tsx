import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import Alert from './Alert';
import LoadingSpinner from './LoadingSpinner';
import ActionButton from './ActionButton';

const Auth: React.FC = () => {
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (!supabase) {
      setError("Authentication service is not configured.");
      setLoading(false);
      return;
    }

    try {
      if (authMode === 'signIn') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('Check your email for a confirmation link to complete registration.');
      }
    } catch (err: any) {
      setError(err.error_description || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto animate-fadeIn">
      <Card>
        <CardHeader>
          <CardTitle>{authMode === 'signIn' ? 'Sign In' : 'Create an Account'}</CardTitle>
          <CardDescription>
            {authMode === 'signIn' 
              ? 'Sign in to access your saved sessions and knowledge base.'
              : 'Sign up to start saving your work in the cloud.'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuthAction} className="space-y-4">
            {error && <Alert variant="destructive" title="Error">{error}</Alert>}
            {message && <Alert variant="success" title="Success">{message}</Alert>}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="form-input w-full"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="form-input w-full"
                placeholder="••••••••"
              />
            </div>
            <ActionButton type="submit" disabled={loading} className="w-full">
              {loading ? <LoadingSpinner.Ring className="h-5 w-5" /> : (authMode === 'signIn' ? 'Sign In' : 'Sign Up')}
            </ActionButton>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {authMode === 'signIn' ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={() => {
                setAuthMode(authMode === 'signIn' ? 'signUp' : 'signIn');
                setError(null);
                setMessage(null);
              }}
              className="font-medium text-primary hover:underline"
            >
              {authMode === 'signIn' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default Auth;

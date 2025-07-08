import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('validate-user-domain function started');

serve(async (req) => {
  try {
    // 1. Validate the request is from Supabase and get the new user record
    const { record: user } = await req.json();
    if (!user || !user.email) {
      console.log('Request did not contain valid user data.');
      return new Response(JSON.stringify({ error: 'Missing user data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing new user: ${user.id}, email: ${user.email}`);

    // 2. The Core Logic: Check the email domain
    const allowedDomain = 'shory.com';
    if (user.email.endsWith(`@${allowedDomain}`)) {
      // If the domain is allowed, do nothing and let the sign-up proceed.
      console.log(`Email domain is allowed for user: ${user.id}`);
      return new Response(JSON.stringify({ message: 'Domain is allowed.' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. If the domain is NOT allowed, delete the user.
    console.log(`Domain not allowed for ${user.email}. Deleting user: ${user.id}`);
    
    // Create a Supabase admin client to perform the deletion.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delete the user from the auth schema.
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      throw deleteError;
    }

    console.log(`Successfully deleted user: ${user.id}`);
    return new Response(
      JSON.stringify({ message: `User with email ${user.email} was deleted.` }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in Edge Function:', error.message);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

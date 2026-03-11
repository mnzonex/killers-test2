// Supabase Configuration Template
// Replace with your real Supabase URL and Key
const SUPABASE_URL = 'https://rcwerdnxvqztmcxcorhi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjd2VyZG54dnF6dG1jeGNvcmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDM3MDEsImV4cCI6MjA4ODgxOTcwMX0.F57R8C2-ajW-C2vKvJRnVkbKb6erTbijkosYDcvf5dc';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.supabaseClient = supabaseClient;

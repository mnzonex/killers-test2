-- ==========================================
-- 1. CLEANUP (Optional - use with caution)
-- ==========================================
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP FUNCTION IF EXISTS public.handle_new_user();

-- ==========================================
-- 2. TABLES
-- ==========================================

-- Table: admin_config (Security for Admin Dashboard)
CREATE TABLE IF NOT EXISTS public.admin_config (
    key_name TEXT PRIMARY KEY,
    key_value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: promo_codes (Prices and details can be edited)
CREATE TABLE IF NOT EXISTS public.promo_codes (
    code TEXT PRIMARY KEY,
    owner_name TEXT NOT NULL,
    bank_details TEXT NOT NULL,
    whatsapp_number TEXT NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    crypto_price NUMERIC DEFAULT 30,
    forex_price NUMERIC DEFAULT 40,
    all_price NUMERIC DEFAULT 60,
    plan_details JSONB DEFAULT '{
        "crypto": ["Daily 3-8 Signals", "95-98% Accuracy", "BTC & ETH Signals"],
        "forex": ["Daily 2-5 Signals", "96-98% Accuracy", "GOLD & BTC Updates"],
        "all": ["Crypto + Forex Signals", "Highest Accuracy", "24/7 Support"]
    }',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: users (Extends Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar_url TEXT,
    display_id BIGINT UNIQUE, 
    promo_code_used TEXT REFERENCES public.promo_codes(code),
    referred_by BIGINT, -- ID of the user who referred them
    referral_points INTEGER DEFAULT 0, -- Points earned
    status TEXT CHECK (status IN ('Registered', 'Pending', 'Active', 'Banned')) DEFAULT 'Registered',
    active_package TEXT DEFAULT 'Free',
    expiry_date TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: announcements
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- info, success, warning, danger
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: activity_logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- 3. FUNCTIONS & TRIGGERS
-- ==========================================

-- Function to generate a random numeric ID for users
CREATE OR REPLACE FUNCTION generate_unique_display_id() 
RETURNS TRIGGER AS $$
DECLARE
    new_id BIGINT;
    id_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate a random 8-digit number
        new_id := floor(random() * (99999999 - 10000000 + 1) + 10000000)::BIGINT;
        SELECT EXISTS(SELECT 1 FROM public.users WHERE display_id = new_id) INTO id_exists;
        EXIT WHEN NOT id_exists;
    END LOOP;
    NEW.display_id := new_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to assign display_id before insert
CREATE OR REPLACE TRIGGER trg_generate_display_id
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION generate_unique_display_id();

-- Function to handle user creation on Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    ref_id BIGINT;
BEGIN
  -- Extract referred_by from metadata
  ref_id := (NEW.raw_user_meta_data->>'referred_by')::BIGINT;

  INSERT INTO public.users (id, email, name, avatar_url, promo_code_used, referred_by)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'User'), 
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'promo_code_used',
    ref_id
  );

  -- Award 10 points to the referrer
  IF ref_id IS NOT NULL THEN
    UPDATE public.users 
    SET referral_points = referral_points + 10 
    WHERE display_id = ref_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 4. SECURITY (RLS)
-- ==========================================

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- ADMIN POLICIES
CREATE POLICY "Admin full access users" ON public.users FOR ALL USING (auth.jwt() ->> 'email' = 'madhushanimsara849@gmail.com');
CREATE POLICY "Admin full access promo" ON public.promo_codes FOR ALL USING (auth.jwt() ->> 'email' = 'madhushanimsara849@gmail.com');
CREATE POLICY "Admin full access logs" ON public.activity_logs FOR ALL USING (auth.jwt() ->> 'email' = 'madhushanimsara849@gmail.com');
CREATE POLICY "Admin full access config" ON public.admin_config FOR ALL USING (auth.jwt() ->> 'email' = 'madhushanimsara849@gmail.com');
CREATE POLICY "Admin full access announcements" ON public.announcements FOR ALL USING (auth.jwt() ->> 'email' = 'madhushanimsara849@gmail.com');

-- PUBLIC POLICIES
CREATE POLICY "Anyone can read promo codes" ON public.promo_codes FOR SELECT USING (true);
CREATE POLICY "Anyone can read admin key name" ON public.admin_config FOR SELECT USING (true);
CREATE POLICY "Anyone can read active announcements" ON public.announcements FOR SELECT USING (is_active = true);

-- USER POLICIES
CREATE POLICY "Users can read own record" ON public.users FOR SELECT USING (auth.uid() = id);
-- Users can only update their own record, but we will use a trigger to prevent sensitive column changes
CREATE POLICY "Users can update own record" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can read own logs" ON public.activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own logs" ON public.activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ==========================================
-- 5. PROTECTIVE TRIGGERS (Security against self-activation)
-- ==========================================

-- Function to prevent unauthorized user updates
CREATE OR REPLACE FUNCTION protect_user_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If not an admin, restrict updates
  IF (auth.jwt() ->> 'email' != 'madhushanimsara849@gmail.com') THEN
    
    -- Prevent changing status to 'Active' or 'Banned'
    IF NEW.status != OLD.status AND (NEW.status = 'Active' OR NEW.status = 'Banned') THEN
        RAISE EXCEPTION 'Unauthorized status change';
    END IF;

    -- Prevent self-increasing referral points
    IF NEW.referral_points != OLD.referral_points THEN
        RAISE EXCEPTION 'Unauthorized points modification';
    END IF;

    -- Prevent changing display_id
    IF NEW.display_id != OLD.display_id THEN
        RAISE EXCEPTION 'Cannot change display ID';
    END IF;

    -- Prevent changing referred_by
    IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
        RAISE EXCEPTION 'Cannot change referrer';
    END IF;

  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_protect_user_fields
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION protect_user_fields();

-- ==========================================
-- 5. INITIAL DATA
-- ==========================================

-- Insert Default Promo Code
INSERT INTO public.promo_codes (code, owner_name, bank_details, whatsapp_number, is_default, crypto_price, forex_price, all_price)
VALUES ('KILLERS10', 'Main Admin', 'Bank: HNB\nAcc: 123456789\nName: Killers VIP Support', '+94700000000', TRUE, 30, 40, 60)
ON CONFLICT (code) DO NOTHING;

-- Insert Admin Credentials (YOU CAN CHANGE THESE)
-- ID: KILLERS-ADMIN
-- Secret: ADMIN-SECRET-7788
INSERT INTO public.admin_config (key_name, key_value) 
VALUES 
('admin_id', 'KILLERS-ADMIN'),
('admin_secret', 'ADMIN-SECRET-7788')
ON CONFLICT (key_name) DO UPDATE SET key_value = EXCLUDED.key_value;

async function signInWithGoogle(promoCodeUsed = null) {
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/login.html',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
                data: {
                    promo_code_used: promoCodeUsed || localStorage.getItem('referral_promo'),
                    referred_by: localStorage.getItem('referral_id')
                }
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Error signing in with Google:', error.message);
        if (window.showToast) {
            window.showToast('Login Failed: ' + error.message, 'error');
        } else {
            alert('Error: ' + error.message);
        }
    }
}

async function signOut() {
    try {
        const { error } = await window.supabaseClient.auth.signOut();
        if (!error) {
            window.location.href = './index.html';
        } else {
            throw error;
        }
    } catch (error) {
        console.error('Logout error:', error.message);
        if (window.showToast) window.showToast('Logout error: ' + error.message, 'error');
    }
}

async function checkSession() {
    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        return session;
    } catch (err) {
        return null;
    }
}

// Global functions
window.signInWithGoogle = signInWithGoogle;
window.signOut = signOut;
window.checkSession = checkSession;

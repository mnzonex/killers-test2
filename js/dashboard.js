let currentUser = null;
let currentPromo = null;
let selectedPkgName = null;
let selectedPkgPrice = null;
let promoSubscription = null;

async function initDashboard() {
    const session = await window.checkSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    const { user } = session;

    // 1. Fetch full user profile from DB
    const { data: dbUser, error: userError } = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    if (userError) {
        console.error('Error fetching user:', userError);
        if (window.showToast) window.showToast('Failed to load profile details.', 'error');
    } else {
        // Enforce registration if no promo code
        if (!dbUser || !dbUser.promo_code_used) {
            window.location.href = 'register.html';
            return;
        }
        currentUser = dbUser;
        updateHeaderUI(user, dbUser);
        generateReferralLink(dbUser);
    }

    // 2. Fetch Announcements
    fetchAnnouncements();

    // 3. Initial Promo Fetch
    const promoCode = currentUser?.promo_code_used || localStorage.getItem('referral_promo') || 'KILLERS10';
    await fetchAndApplyPromo(promoCode);

    // 4. Setup Real-time Listener for Promo Code (Prices/Details)
    setupRealtimePromo(promoCode);

    updateUI();
}

function updateHeaderUI(authUser, dbUser) {
    document.getElementById('user-name').textContent = dbUser.name || authUser.email;
    document.getElementById('user-email').textContent = authUser.email;
    document.getElementById('user-avatar').src = dbUser.avatar_url || 'assets/logo.jpg';

    document.getElementById('display-id').textContent = dbUser.display_id || 'Generating...';
    document.getElementById('ref-points').textContent = dbUser.referral_points || 0;
}

function generateReferralLink(user) {
    if (!user.display_id) return;
    const refUrl = `${window.location.origin}/register.html?ref=${user.display_id}`;
    const input = document.getElementById('referral-url');
    if (input) input.value = refUrl;
}

async function fetchAnnouncements() {
    const { data, error } = await window.supabaseClient
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

    if (data && data.length > 0) {
        const bar = document.getElementById('announcement-bar');
        const text = document.getElementById('ann-text');
        bar.classList.remove('hidden');
        bar.className = `ann-bar ann-${data[0].type}`;
        text.textContent = data[0].content;
    }
}

async function fetchAndApplyPromo(code) {
    const { data, error } = await window.supabaseClient
        .from('promo_codes')
        .select('*')
        .eq('code', code)
        .single();

    if (data) {
        currentPromo = data;
        renderPrices();
    }
}

function setupRealtimePromo(code) {
    if (promoSubscription) promoSubscription.unsubscribe();

    promoSubscription = window.supabaseClient
        .channel('realtime_promo')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'promo_codes',
            filter: `code=eq.${code}`
        }, payload => {
            currentPromo = payload.new;
            renderPrices();
            if (window.showToast) window.showToast('Prices updated in real-time!', 'success');
        })
        .subscribe();
}

function renderPrices() {
    if (!currentPromo) return;

    const cards = document.querySelectorAll('.pkg-card');
    cards.forEach(card => {
        const title = card.querySelector('h4').textContent;
        const priceEl = card.querySelector('.price');

        if (title.includes('Crypto')) priceEl.textContent = `${currentPromo.crypto_price} USDT`;
        if (title.includes('Forex')) priceEl.textContent = `${currentPromo.forex_price} USDT`;
        if (title.includes('All-in-One')) priceEl.textContent = `${currentPromo.all_price} USDT`;
    });
}

function updateUI() {
    const status = currentUser?.status || 'Registered';
    const badge = document.getElementById('status-badge');
    badge.textContent = status;
    badge.className = 'badge ' + status.toLowerCase();
    
    // 🚩 HANDLE BANNED USERS
    if (status === 'Banned') {
        if (window.showToast) window.showToast('Your account is banned. Contact support.', 'error');
        setTimeout(() => window.signOut(), 3000);
        return;
    }

    document.getElementById('active-plan-name').textContent = currentUser.active_package || 'None';

    // Reset visibility
    document.getElementById('package-section').classList.add('hidden');
    document.getElementById('active-section').classList.add('hidden');

    const statusActionBox = document.getElementById('status-action-box');
    if (statusActionBox) {
        statusActionBox.innerHTML = '';
        if (status === 'Registered') {
            statusActionBox.innerHTML = `<div class="status-msg"><p>Ready to upgrade? Choose a plan to access VIP signals.</p><a href="plans.html" class="btn-upgrade">Go to Plans</a></div>`;
            document.getElementById('package-section').classList.remove('hidden');
        } else if (status === 'Pending') {
            statusActionBox.innerHTML = `<div class="waiting-msg"><i class="fas fa-clock"></i><div><h4>Activation Pending</h4><p>We are verifying payment for <strong>${currentUser.active_package}</strong>.</p></div></div>`;
        } else if (status === 'Active') {
            document.getElementById('active-section').classList.remove('hidden');
            document.getElementById('expiry-txt').textContent = currentUser.expiry_date ? new Date(currentUser.expiry_date).toLocaleDateString() : 'Lifetime';
        }
    }

    const accessBtns = document.querySelectorAll('.btn-access');
    accessBtns.forEach(btn => {
        if (status !== 'Active') {
            btn.classList.add('disabled-link');
            btn.onclick = (e) => { e.preventDefault(); window.showToast('Please activate your VIP membership.', 'warning'); };
        } else {
            btn.classList.remove('disabled-link');
            btn.onclick = null;
        }
    });

    if (status === 'Active' && statusActionBox) {
         statusActionBox.innerHTML = `<div class="active-quick-links"><p>Quick Access:</p><div class="quick-btns"><a href="https://t.me/your_crypto_link" class="btn-quick" target="_blank"><i class="fab fa-telegram"></i> Telegram</a></div></div>`;
    }
}

function selectPkg(name, defaultPrice) {
    // Redirect to dedicated payment page with package type
    window.location.href = `payment.html?pkg=${encodeURIComponent(name)}`;
}

async function handlePaidClick() {
    if (!currentUser || !selectedPkgName) return;

    const { error } = await window.supabaseClient
        .from('users')
        .update({
            status: 'Pending',
            active_package: selectedPkgName
        })
        .eq('id', currentUser.id);

    if (error) {
        if (window.showToast) window.showToast(error.message, 'error');
    } else {
        await window.supabaseClient.from('activity_logs').insert({
            user_id: currentUser.id,
            action: `Paid: ${selectedPkgName}`
        });

        const waNum = currentPromo?.whatsapp_number || '+94700000000';
        const msg = `Hi, I paid for ${selectedPkgName} (${selectedPkgPrice} USDT). My User ID: ${currentUser.display_id}. Email: ${currentUser.email}`;
        window.open(`https://wa.me/${waNum.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');

        location.reload();
    }
}

function copyId() {
    const id = document.getElementById('display-id').textContent;
    navigator.clipboard.writeText(id).then(() => {
        if (window.showToast) window.showToast('Unique ID Copied: ' + id, 'success');
    });
}

function copyRefLink() {
    const url = document.getElementById('referral-url').value;
    navigator.clipboard.writeText(url).then(() => {
        if (window.showToast) window.showToast('Referral Link Copied!', 'success');
    });
}

function openProfileModal() {
    document.getElementById('edit-name-input').value = currentUser?.name || '';
    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

async function updateProfileName() {
    const newName = document.getElementById('edit-name-input').value.trim();
    if (!newName) return;

    const { error } = await window.supabaseClient
        .from('users')
        .update({ name: newName })
        .eq('id', currentUser.id);

    if (error) {
        if (window.showToast) window.showToast(error.message, 'error');
    } else {
        currentUser.name = newName;
        document.getElementById('user-name').textContent = newName;
        closeProfileModal();
        if (window.showToast) window.showToast('Profile updated!', 'success');
    }
}

window.copyId = copyId;
window.copyRefLink = copyRefLink;
window.selectPkg = selectPkg;
window.handlePaidClick = handlePaidClick;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.updateProfileName = updateProfileName;
document.addEventListener('DOMContentLoaded', initDashboard);

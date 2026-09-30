const menuButton = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
function closeMenu() { menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Ouvrir le menu'); mobileNav.hidden = true; document.body.classList.remove('menu-open'); }
menuButton.addEventListener('click', () => { const open = menuButton.getAttribute('aria-expanded') !== 'true'; menuButton.setAttribute('aria-expanded', String(open)); menuButton.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu'); mobileNav.hidden = !open; document.body.classList.toggle('menu-open', open); });
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuButton.focus(); } });
window.matchMedia('(min-width: 701px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

// Native dialogs retain keyboard focus and close with Escape.
const projectDialog = document.querySelector('#project-dialog');
const infoDialog = document.querySelector('#info-dialog');
let dialogTrigger;
function openDialog(dialog, trigger) { closeMenu(); dialogTrigger = trigger; dialog.showModal(); document.body.style.overflow = 'hidden'; }
document.querySelectorAll('[data-open-project]').forEach(button => button.addEventListener('click', () => openDialog(projectDialog, button)));
document.querySelectorAll('[data-open-info]').forEach(button => button.addEventListener('click', () => openDialog(infoDialog, button)));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { const box = dialog.getBoundingClientRect(); if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close(); });
  dialog.addEventListener('close', () => { document.body.style.overflow = ''; dialogTrigger?.focus(); });
});

const projectForm = document.querySelector('#project-form');
const projectEdit = document.querySelector('#project-edit');
const projectResult = document.querySelector('#project-result');
const projectStatus = document.querySelector('#project-status');
const projectSubmit = projectForm.querySelector('[type="submit"]');
const projectEndpoint = 'https://script.google.com/macros/s/AKfycbwSdlaoPNUjJy-9UMhTv8Cl19_hOUciCSbFvG9UZVupCWY5S44GF64upeUFmIgphSrY/exec';
let projectSending = false;
let downloadUrl;
projectForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (projectSending || !projectForm.reportValidity()) return;
  const values = Object.fromEntries([...new FormData(projectForm)].map(([key, value]) => [key, value.trim()]));
  // The deployed script stores six fields. Include the optional phone in
  // Message so it is saved immediately, without requiring a Google redeploy.
  const requestValues = {...values};
  delete requestValues.phone;
  if (values.phone) requestValues.message = `Téléphone : ${values.phone}\n\n${values.message}`.trim();
  const controls = [...projectForm.elements];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  projectSending = true;
  controls.forEach(control => { control.disabled = true; });
  projectForm.setAttribute('aria-busy', 'true');
  projectSubmit.textContent = 'Envoi en cours…';
  projectStatus.dataset.state = 'pending';
  projectStatus.textContent = 'Nous enregistrons votre demande…';

  try {
    // URL-encoded fields avoid a cross-origin preflight. A readable confirmation
    // from Apps Script is required: an opaque response never counts as success.
    const response = await fetch(projectEndpoint, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      body: new URLSearchParams(requestValues),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Confirmation unavailable');
    const result = await response.json();
    if (result.ok !== true) {
      projectStatus.dataset.state = 'error';
      projectStatus.textContent = 'Votre demande n’a pas pu être enregistrée. Vos réponses sont conservées ; veuillez réessayer dans un instant.';
      return;
    }

    const summary = `NIGHTBOX — MON PROJET\n\nÉtablissement : ${values.venue}\nType : ${values.type}\nVille : ${values.city}\n\nContact : ${values.name}\nE-mail : ${values.email}\nTéléphone : ${values.phone || 'Non renseigné'}\n\nMon projet :\n${values.message || 'À échanger ensemble.'}\n\nDemande transmise à Nightbox.\nLa sélection et les modalités restent à définir.\n`;
    document.querySelector('#project-summary').textContent = summary;
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([summary], {type:'text/plain;charset=utf-8'}));
    document.querySelector('#download-project').href = downloadUrl;
    projectStatus.textContent = '';
    projectEdit.hidden = true;
    projectResult.hidden = false;
    projectDialog.setAttribute('aria-label', 'Votre demande a été enregistrée');
    projectDialog.removeAttribute('aria-labelledby');
    projectDialog.scrollTop = 0;
    if (projectDialog.open) document.querySelector('#download-project').focus();
  } catch (error) {
    // No automatic retry: the server may have saved the row before the
    // connection was interrupted. Preserve the fields for the visitor.
    projectStatus.dataset.state = 'error';
    projectStatus.textContent = 'Nous n’avons pas pu confirmer l’enregistrement. Vos réponses sont conservées. Vérifiez votre connexion avant de réessayer ; si la demande avait déjà été reçue, un second envoi pourrait créer un doublon.';
  } finally {
    clearTimeout(timeout);
    projectSending = false;
    controls.forEach(control => { control.disabled = false; });
    projectForm.removeAttribute('aria-busy');
    projectSubmit.textContent = 'Envoyer ma demande';
    if (!projectEdit.hidden && projectDialog.open) projectStatus.focus();
  }
});
document.querySelector('#edit-project').addEventListener('click', () => {
  projectForm.reset();
  projectStatus.textContent = '';
  projectEdit.hidden = false;
  projectResult.hidden = true;
  projectDialog.removeAttribute('aria-label');
  projectDialog.setAttribute('aria-labelledby', 'project-dialog-title');
  projectForm.elements.name.focus();
});

// Content stays visible if animation support is unavailable.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-motion');
  const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); } }); }, {threshold:0.08});
  document.querySelectorAll('.concept-top, .benefits article, .product-copy, .story-grid, .venues-heading, .steps article').forEach(element => { element.classList.add('reveal'); observer.observe(element); });
}

// Keep focus inside the mobile navigation while it is open.
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab' || mobileNav.hidden) return;
  const lastLink = mobileNav.querySelector('a:last-child');
  if (event.shiftKey && document.activeElement === menuButton) { event.preventDefault(); lastLink.focus(); }
  else if (!event.shiftKey && document.activeElement === lastLink) { event.preventDefault(); menuButton.focus(); }
});

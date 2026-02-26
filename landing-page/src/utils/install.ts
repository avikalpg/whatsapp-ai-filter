export const downloadInstallScript = () => {
  const link = document.createElement('a');
  link.href = '/install.sh';
  link.download = 'install.sh';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const navigateToGuide = (router: { push: (url: string) => void }) => {
  router.push('/guide');
};

import { useTranslation } from 'react-i18next';

// View toggle component
const ViewToggle = ({ viewMode, setViewMode }) => {
  const { t } = useTranslation();
  return (
    <div className="view-toggle-container d-flex flex-column justify-content-center my-1 col-10 col-md-6 col-lg-4 col-xl-2 mx-auto">
      <div className="btn-group view-toggle" role="group" aria-label={t('fc-view-toggle')}>
        <button
          type="button"
          className={`btn btn-outline-light ${viewMode === 'daily' ? 'active' : ''}`}
          aria-label={t('fc-daily-forecast')}
          aria-pressed={viewMode === 'daily'}
          onClick={() => setViewMode('daily')}
        >
          {t('fc-daily')}
        </button>
        <button
          type="button"
          className={`btn btn-outline-light ${viewMode === 'hourly' ? 'active' : ''}`}
          aria-label={t('fc-hourly-forecast')}
          aria-pressed={viewMode === 'hourly'}
          onClick={() => setViewMode('hourly')}
        >
          {t('fc-hourly')}
        </button>
      </div>
    </div>
  );
};

export default ViewToggle;

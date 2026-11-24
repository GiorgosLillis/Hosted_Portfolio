import { useTranslation } from 'react-i18next';

const UnitToggle = ({ Unit, setUnit}) => {
  const { t } = useTranslation();
  return (
    <div className="view-toggle-container d-flex justify-content-center justify-content-md-start col-12 col-md-5">
      <div className="btn-group view-toggle d-flex flex-md-column justify-content-center col-8 col-md-6 m-3" role="group" aria-label={t('fc-temp-toggle')}>
        <button
          type="button"
          className={`btn btn-outline-light col-6 col-md-10 m-0 rounded-0 ${Unit === 'celsius' ? 'active' : ''}`}
          aria-label={t('fc-celsius')}
          aria-pressed={Unit === 'celsius'}
          onClick={() => setUnit('celsius')}
        >
          {t('fc-celsius')}
        </button>
        <button
          type="button"
          className={`btn btn-outline-light col-6 col-md-10 m-0 rounded-0 ${Unit === 'fahrenheit' ? 'active' : ''}`}
          aria-label={t('fc-fahrenheit')}
          aria-pressed={Unit === 'fahrenheit'}
          onClick={() => setUnit('fahrenheit')}
        >
          {t('fc-fahrenheit')}
        </button>
      </div>
    </div>
  );
};

export default UnitToggle;

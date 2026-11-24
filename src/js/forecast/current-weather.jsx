import { memo } from "react";
import { formatters, getThermometer, WarningMessage, ErrorMessage, usePlaceNames, formatPlace } from "./functions.jsx";
import UnitToggle from "./temp-toggle.jsx";
import { useTranslation } from 'react-i18next';
import { conditionLabel } from '../common/i18n.js';

// Top hero section of the weather page: location, temperature, condition, favorite star
const CurrentWeather = memo(({ locationInfo, weatherData, lastUpdate, warning, error, Unit, setUnit, isFavorite, addToFavorites, removeFromFavorites }) => {
    const { t } = useTranslation();
    usePlaceNames();
    const condition = conditionLabel(weatherData.current.code, weatherData.current.condition);
    // Our own warnings arrive as {key} so they follow the language, anything else is already text
    const warningText = warning && typeof warning === 'object' ? t(warning.key) : warning;

    const handleFavoriteClick = () => {
        if (isFavorite) {
            removeFromFavorites();
        } else {
            addToFavorites();
        }
    };

    return (
        <>
            <section className="d-flex flex-column align-items-center justify-content-center text-center px-2 px-md-5">
                <ErrorMessage error={error} />
                <WarningMessage warning={warningText} />
                <div className="col-12 d-flex align-items-center justify-content-center">
                    <h1 className="fs-2 my-0 text-center" id="locationInfo"> {formatPlace(locationInfo)} </h1>
                    <button onClick={handleFavoriteClick} className="btn btn-link" style={{ textDecoration: 'none' }} aria-label={isFavorite ? t('fc-fav-remove') : t('fc-fav-add')}>
                        <i className={`bi ${isFavorite ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" style={{ fontSize: '1.5rem', color: isFavorite ? 'gold' : 'white' }}></i>
                    </button>
                </div>
                <div className="fs-2 my-2 row d-flex align-items-center justify-content-center col-12 col-lg-9 col-xl-6 gx-0">
                    <div className="col-12 col-md-7 d-flex align-items-center justify-content-center justify-content-md-end py-1 mb-md-2">
                        {getThermometer(weatherData.current.temperature)}
                        <h2 className="display-2 mb-0 me-md-3">{formatters.temperature(weatherData.current.temperature, Unit)}</h2>
                    </div>
                    <UnitToggle Unit={Unit} setUnit={setUnit} />
                    <div className="col-12 d-flex align-items-center justify-content-center py-1 mb-2">
                        <img
                            src={weatherData.current.icon}
                            alt={condition}
                            className="weather-icon me-3 py-1 px-0"
                        />
                        <h2 className="mx-3 mb-0" id="conditionInfo">{condition}</h2>
                    </div>
                    <div className="col-12">
                        <h2 id="lastUpdateInfo">{t('last-update', { time: lastUpdate ? formatters.time(lastUpdate) : t('fc-unknown') })}</h2>
                    </div>
                </div>
            </section>
        </>
    );
});

export default CurrentWeather;


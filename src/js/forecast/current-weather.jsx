import { formatters, getThermometer, WarningMessage, ErrorMessage} from "./functions.jsx";

// The main component that fetches and displays current weather data.
export const CurrentWeather = ({ locationInfo, weatherData, lastUpdate, warning, error }) => { 
    return(
        <> 
        <section className="d-flex flex-column align-items-center justify-content-center text-center px-2 px-md-5">  
            <ErrorMessage error={error} />
            <WarningMessage warning={warning} />
            <h2 className="fs-2 my-0 text-center"> {locationInfo.city}, {locationInfo.country}  </h2>
            <div className="fs-2 my-2 row d-flex align-items-center justify-content-center col-12 col-lg-9 col-xl-6 gx-0">
                <div className="col-12 d-flex align-items-center justify-content-center py-1 mb-2">
                    {getThermometer(weatherData.current.temperature)}
                    <h1 className="display-2 mb-0">{weatherData.current.temperature}°C</h1>
                </div>
                <div className="col-12 d-flex align-items-center justify-content-center py-1 mb-2">
                    <img
                        src={weatherData.current.icon}
                        alt={weatherData.current.condition}
                        className="weather-icon me-3 py-1 px-0"
                    />
                    <h2 className="mx-3 mb-0">{weatherData.current.condition}</h2>
                </div>
                <div className="col-12">
                    <h2>Last update: {lastUpdate ? formatters.time(lastUpdate) : 'Unknown'}</h2>
                </div>
            </div>
        </section>
        </>
    );
};

export default CurrentWeather;


// Unit toggle component
const UnitToggle = ({ Unit, setUnit}) => {
  return (
    <div className="view-toggle-container d-flex justify-content-center justify-content-md-start col-12 col-md-5">
      <div className="btn-group view-toggle d-flex flex-md-column justify-content-center col-8 col-md-6 m-3" role="group" aria-label="Temperature Toggle">
        <button
          type="button"
          className={`btn btn-outline-light col-6 col-md-12 m-0 rounded-0 ${Unit === 'celsius' ? 'active' : ''}`}
          onClick={() => setUnit('celsius')}
        >
          Celsius
        </button>
        <button
          type="button"
          className={`btn btn-outline-light col-6 col-md-12 m-0 rounded-0 ${Unit === 'fahrenheit' ? 'active' : ''}`}
          onClick={() => setUnit('fahrenheit')}
        >
          Fahrenheit
        </button>
      </div>
    </div>
  );
};

export default UnitToggle;
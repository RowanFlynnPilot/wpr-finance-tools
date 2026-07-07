import React from 'react'
import ReactDOM from 'react-dom/client'
import TrueCostCalculator from './TrueCostCalculator.jsx'
import RentVsBuyCalculator from './RentVsBuyCalculator.jsx'
import SourcesPage from './SourcesPage.jsx'
import './truecost.css'

// One bundle, three views: the WordPress iframe (or a shared link) picks with
// ?tool=rentvsbuy / ?tool=sources; the bare URL is the True Cost calculator.
const tool = new URLSearchParams(window.location.search).get('tool')
const view =
  tool === 'rentvsbuy' ? (
    <RentVsBuyCalculator />
  ) : tool === 'sources' ? (
    <SourcesPage />
  ) : (
    <TrueCostCalculator />
  )
if (tool === 'rentvsbuy') {
  document.title = 'Rent or Buy in Marathon County? — WPR Homebuyer Tools'
} else if (tool === 'sources') {
  document.title = 'Sources & Methodology — WPR Homebuyer Tools'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{view}</React.StrictMode>,
)

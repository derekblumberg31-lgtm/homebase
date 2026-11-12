import { useState } from 'react';
import { useData, useNow } from '../../data/DataProvider';
import { Switch } from '../../ui/controls';
import { Page, Section } from '../../ui/layout';
import { PROPERTY_TYPE_LABEL } from '../property/labels';
import { reportHistory, reportSystems, reportWarranties } from './report';

const NOTHING = 'Nothing recorded yet.';

/** A one-page record of the home to print or save as a PDF. It leaves out keys, contacts, notes and photos. */
export function ReportPage() {
  const data = useData();
  const now = useNow();
  const [includeCosts, setIncludeCosts] = useState(false);
  const [includeSerials, setIncludeSerials] = useState(true);
  const property = data.property;
  const systems = reportSystems(data, now, { includeSerials });
  const warranties = reportWarranties(data, now);
  const history = reportHistory(data, { includeCosts });
  const facts = [property?.type ? PROPERTY_TYPE_LABEL[property.type] : null, property?.yearBuilt ? `Built ${property.yearBuilt}` : null, property?.squareFeet ? `${property.squareFeet.toLocaleString()} sq ft` : null]
    .filter(Boolean)
    .join(' · ');
  const prepared = new Date(now).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Page title="Home report" subtitle="Print it, or save it as a PDF from the print dialog." back={{ to: '/property', label: 'Property' }}>
      <div className="report-controls">
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => window.print()}>
            Print or save as PDF
          </button>
        </div>
        <Section>
          <div className="group">
            <div className="row">
              <span className="row-main">
                <span className="row-title">Include costs</span>
                <span className="row-sub is-wrap">Off by default. A report is often shared with a buyer.</span>
              </span>
              <Switch checked={includeCosts} onChange={setIncludeCosts} label="Include costs" />
            </div>
            <div className="row">
              <span className="row-main">
                <span className="row-title">Include serial numbers</span>
              </span>
              <Switch checked={includeSerials} onChange={setIncludeSerials} label="Include serial numbers" />
            </div>
          </div>
        </Section>
      </div>

      <article className="report">
        <h1>{property?.nickname || 'Our home'}</h1>
        {property?.address && <p>{property.address}</p>}
        {facts && <p>{facts}</p>}
        <p>Prepared {prepared} with Homebase.</p>

        <h2>Systems</h2>
        {systems.length === 0 ? (
          <p>{NOTHING}</p>
        ) : (
          <div className="report-table-wrap" role="region" aria-label="Systems table, scrolls sideways" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">System</th>
                  <th scope="col">Brand and model</th>
                  <th scope="col">Installed</th>
                  <th scope="col">Age</th>
                  <th scope="col">Warranty</th>
                  {includeSerials && <th scope="col">Serial</th>}
                </tr>
              </thead>
              <tbody>
                {systems.map((s, i) => (
                  <tr key={i}>
                    <th scope="row">{s.name}</th>
                    <td>{s.brandModel}</td>
                    <td>{s.installed}</td>
                    <td>{s.age}</td>
                    <td>{s.warranty}</td>
                    {includeSerials && <td>{s.serial}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Warranties and coverage</h2>
        {warranties.length === 0 ? (
          <p>{NOTHING}</p>
        ) : (
          <div className="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Covers</th>
                  <th scope="col">Ends</th>
                </tr>
              </thead>
              <tbody>
                {warranties.map((w, i) => (
                  <tr key={i}>
                    <th scope="row">{w.title}</th>
                    <td>{w.covers}</td>
                    <td>{w.endsText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Service history</h2>
        {history.length === 0 ? (
          <p>{NOTHING}</p>
        ) : (
          history.map((group) => (
            <section key={group.year}>
              <h3>{group.year}</h3>
              <div className="report-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Job</th>
                      <th scope="col">System or item</th>
                      <th scope="col">Done by</th>
                      {includeCosts && <th scope="col">Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <th scope="row">{r.job}</th>
                        <td>{r.on}</td>
                        <td>{r.by}</td>
                        {includeCosts && <td>{r.cost ?? ''}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}

        <p className="report-foot">Keys, contacts, notes and photos are left out.</p>
      </article>
    </Page>
  );
}

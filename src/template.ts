export const APP_TEMPLATE = `
  <div class="nr-prb-app">
    <section class="nr-import" aria-labelledby="nr-import-title">
      <div class="nr-section-heading">
        <div>
          <p class="nr-step">Step 1</p>
          <h2 id="nr-import-title">Import interference counters</h2>
        </div>
        <p class="nr-privacy"><span aria-hidden="true">●</span> Your network data never leaves your browser.</p>
      </div>
      <div class="nr-import-grid">
        <button class="nr-dropzone" type="button" data-file-trigger aria-describedby="nr-file-help">
          <span class="nr-upload-mark" aria-hidden="true">CSV</span>
          <span><strong>Select or drop a CSV or XLSX file</strong><small id="nr-file-help">Up to 25 MB. Comma, semicolon, and tab separators are supported.</small></span>
        </button>
        <input data-file-input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
        <div class="nr-demo-control">
          <label for="nr-demo-kind">No file available?</label>
          <select id="nr-demo-kind" data-demo-kind>
            <option value="persistent">Persistent narrowband interference</option>
            <option value="broadband">Temporary broadband interference</option>
            <option value="multicell">Multi-cell comparison</option>
          </select>
          <button type="button" class="nr-button nr-button-secondary" data-demo>Try demo data</button>
          <small>Synthetic data only. It does not reproduce any vendor or customer export.</small>
        </div>
      </div>
      <div class="nr-template-tools" aria-label="Empty CSV templates">
        <div>
          <strong>Need a correctly formatted starting file?</strong>
          <small>Download an empty header-only template. In wide format, add or remove <code>PRB_*</code> columns to match the counters in your export.</small>
        </div>
        <div class="nr-template-actions">
          <button type="button" class="nr-button nr-button-compact" data-template-wide>Download wide CSV template</button>
          <button type="button" class="nr-button nr-button-compact" data-template-long>Download long CSV template</button>
        </div>
      </div>
      <div class="nr-progress" data-progress hidden aria-live="polite">
        <div class="nr-progress-track"><span data-progress-bar></span></div>
        <p data-progress-label>Preparing local parser</p>
      </div>
      <p class="nr-error" data-error role="alert" hidden></p>
    </section>

    <section class="nr-mapping" data-mapping hidden aria-labelledby="nr-mapping-title">
      <div class="nr-section-heading">
        <div>
          <p class="nr-step">Step 2</p>
          <h2 id="nr-mapping-title">Confirm the column mapping</h2>
        </div>
        <p class="nr-muted" data-row-count></p>
      </div>
      <div class="nr-control-grid nr-mapping-controls">
        <label data-sheet-field hidden>Worksheet<select data-sheet></select></label>
        <label>Data layout<select data-format><option value="wide">Wide, one PRB per column</option><option value="long">Long, one measurement per row</option></select></label>
        <label>Timestamp column<select data-timestamp></select><small>Optional for a snapshot.</small></label>
        <label>Cell column<select data-cell-column></select><small>Optional for a single unnamed cell.</small></label>
        <label data-long-field>PRB index column<select data-prb-column></select></label>
        <label data-long-field>Value column<select data-value-column></select></label>
        <label>Decimal convention<select data-decimal><option value="auto">Automatic</option><option value="point">Point decimal</option><option value="comma">Comma decimal</option></select></label>
      </div>
      <p class="nr-detection" data-detection></p>
      <div class="nr-preview-wrap" tabindex="0" aria-label="Imported data preview">
        <table class="nr-preview"><thead data-preview-head></thead><tbody data-preview-body></tbody></table>
      </div>
      <div class="nr-config-block">
        <h3>Measurement meaning</h3>
        <div class="nr-control-grid">
          <label>Unit<select data-unit><option value="dbm">dBm</option><option value="db">dB</option><option value="raw">Raw or vendor counter</option><option value="custom">Custom unit</option></select></label>
          <label data-custom-unit-field hidden>Custom unit<input data-custom-unit type="text" maxlength="24" value="units" /></label>
          <label>Interference direction<select data-direction><option value="higher">Higher values mean more interference</option><option value="lower">Lower values mean more interference</option></select></label>
          <label>Color scale<select data-scale-mode><option value="auto">Automatic range</option><option value="manual">Manual minimum and maximum</option></select></label>
          <label data-manual-scale hidden>Minimum<input data-scale-min type="number" step="any" /></label>
          <label data-manual-scale hidden>Maximum<input data-scale-max type="number" step="any" /></label>
          <label>Interference threshold<input data-threshold type="number" step="any" placeholder="Optional" /><small>No quality verdict is assigned without your threshold.</small></label>
          <label>Palette<select data-palette><option value="cividis">Cividis</option><option value="viridis">Viridis</option><option value="magma">Magma</option><option value="blue-orange">Blue to orange</option></select></label>
        </div>
      </div>
      <div class="nr-action-row">
        <button type="button" class="nr-button nr-button-primary" data-analyze>Generate heatmap</button>
        <p data-mapping-warning class="nr-muted" aria-live="polite"></p>
      </div>
    </section>

    <section class="nr-results" data-results hidden aria-labelledby="nr-results-title">
      <div class="nr-section-heading">
        <div>
          <p class="nr-step">Step 3</p>
          <h2 id="nr-results-title">Interference view</h2>
        </div>
        <p class="nr-muted">Values are descriptive. Interpret them using the counter definition supplied by your vendor or OSS.</p>
      </div>

      <div class="nr-results-toolbar" aria-label="Visualization controls">
        <label class="nr-cell-selector">Cell<select data-cell-filter></select></label>
        <label>Aggregation<select data-interval><option value="0">No time aggregation</option><option value="60000">1 minute</option><option value="300000">5 minutes</option><option value="900000">15 minutes</option><option value="3600000">1 hour</option></select></label>
        <label>From<input data-start type="datetime-local" /></label>
        <label>To<input data-end type="datetime-local" /></label>
        <button type="button" class="nr-button nr-button-compact" data-apply-filters>Apply period filter</button>
      </div>

      <div class="nr-summary-grid" data-summary-grid aria-live="polite">
        <div><span>PRBs analyzed</span><strong data-summary-prbs>0</strong></div>
        <div><span>Periods</span><strong data-summary-periods>0</strong></div>
        <div><span>Cells present</span><strong data-summary-cells>0</strong></div>
        <div><span>Missing values</span><strong data-summary-missing>0</strong></div>
        <div><span>Time range</span><strong data-summary-range>Not available</strong></div>
        <div><span>Threshold</span><strong data-summary-threshold>Not set</strong></div>
      </div>

      <div class="nr-visual-toolbar">
        <div class="nr-toolbar-group">
          <button type="button" class="nr-button nr-button-compact" data-zoom-out aria-label="Zoom out on PRB range">Zoom out</button>
          <button type="button" class="nr-button nr-button-compact" data-zoom-in aria-label="Zoom in on PRB range">Zoom in</button>
          <button type="button" class="nr-button nr-button-secondary nr-button-compact" data-fit>Fit full bandwidth</button>
        </div>
        <div class="nr-toolbar-group">
          <button type="button" class="nr-button nr-button-compact" data-export-png>Export PNG</button>
          <button type="button" class="nr-button nr-button-compact" data-export-csv>Export summary CSV</button>
          <button type="button" class="nr-button nr-button-compact" data-print>Print view</button>
        </div>
      </div>

      <figure class="nr-heatmap-figure">
        <div class="nr-canvas-shell" data-heatmap-shell>
          <canvas data-heatmap tabindex="0" aria-label="PRB interference heatmap. Use the zoom controls or mouse wheel to inspect a PRB range."></canvas>
          <div class="nr-tooltip" data-tooltip hidden role="status"></div>
        </div>
        <figcaption><span data-visible-range>Full PRB range</span><span>Every detected PRB is retained. Tick labels are sampled for readability.</span></figcaption>
      </figure>

      <label class="nr-overview-toggle"><input type="checkbox" data-overview-toggle /> Show compact multi-cell overview</label>
      <div class="nr-overview" data-overview hidden></div>

      <section class="nr-summary-chart" aria-labelledby="nr-chart-title">
        <div class="nr-subheading"><h3 id="nr-chart-title">PRB statistical profile</h3><p>Mean, median, maximum, and P95 across the selected periods.</p></div>
        <canvas data-summary-chart aria-label="Statistical profile by PRB"></canvas>
      </section>

      <section class="nr-affected" aria-labelledby="nr-affected-title">
        <div class="nr-subheading"><h3 id="nr-affected-title">Most affected PRBs</h3><p data-table-note>Ranked using the selected interference direction.</p></div>
        <div class="nr-table-wrap" tabindex="0">
          <table><thead><tr><th scope="col">PRB</th><th scope="col">Mean</th><th scope="col">Maximum</th><th scope="col">P95</th><th scope="col">Periods at threshold</th></tr></thead><tbody data-affected-body></tbody></table>
        </div>
      </section>
      <div class="nr-status-list" data-status-list hidden></div>
    </section>
  </div>
`;

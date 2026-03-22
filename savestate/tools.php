<?php
/**
 * tools.php — SaveState v2 Tools & Diagnostics
 * Includes: Clipboard, Keyboard, Mouse, Mic, Speakers, System Info
 * Known Issues / Heads Up manager lives in settings.php
 */
require_once __DIR__ . '/common.php';
$user = requireLogin();

pageHead('Tools');
appShellOpen($user, 'tools.php');
appSubheader($user, [], '');
?>

<div class="data-page" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start">

  <!-- ── Left Column ─────────────────────────────────────────── -->
  <div style="display:flex;flex-direction:column;gap:1rem">

    <!-- Clipboard Viewer -->
    <section class="panel glass">
      <div class="panel__header"><span>📋 Clipboard Viewer</span></div>
      <div class="panel__body">
        <p style="font-size:0.83rem;color:var(--text-muted)">
          Click below to retrieve current clipboard contents.
        </p>
        <button id="clipboardBtn" class="btn">Show Clipboard</button>
        <pre id="clipboardOutput"
          style="margin-top:0.5rem;padding:0.5rem;border-radius:var(--radius-sm);background:rgba(0,0,0,0.2);font-size:0.78rem;white-space:pre-wrap;word-break:break-all;color:var(--text-muted);min-height:40px"></pre>
      </div>
    </section>

    <!-- Keyboard Tester -->
    <section class="panel glass">
      <div class="panel__header"><span>⌨ Keyboard Tester</span></div>
      <div class="panel__body">
        <p style="font-size:0.83rem;color:var(--text-muted)">Click the box, then press keys.</p>
        <div id="keyboardBox" tabindex="0" style="height:80px;border:1px solid var(--border);border-radius:var(--radius-sm);
                    background:rgba(0,0,0,0.2);cursor:text;outline:none;padding:0.5rem;
                    font-family:var(--font-mono);font-size:0.8rem;color:var(--text-faint)">
          Click here first…
        </div>
        <pre id="keyLog" style="max-height:80px;overflow-y:auto;font-size:0.75rem;
                                color:var(--text-muted);background:rgba(0,0,0,0.15);
                                padding:0.4rem;border-radius:var(--radius-sm);margin-top:0.4rem"></pre>
        <button class="btn btn-sm" onclick="document.getElementById('keyLog').textContent=''">Clear</button>
      </div>
    </section>

    <!-- Mouse Tester -->
    <section class="panel glass">
      <div class="panel__header"><span>🖱 Mouse Tester</span></div>
      <div class="panel__body">
        <div id="mouseArea" style="height:120px;border:1px solid var(--border);border-radius:var(--radius-sm);
                    background:rgba(0,0,0,0.2);position:relative;overflow:hidden;cursor:crosshair">
          <div id="mouseXhair" style="position:absolute;pointer-events:none;width:12px;height:12px;
               border-radius:50%;background:var(--accent);opacity:0.7;transform:translate(-50%,-50%);
               display:none;box-shadow:0 0 8px var(--accent-glow)"></div>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem;font-family:var(--font-mono)">
          XY: (<span id="mouseX">–</span>, <span id="mouseY">–</span>)
          &nbsp;|&nbsp; Event: <span id="mouseEvent">–</span>
        </div>
      </div>
    </section>

  </div>

  <!-- ── Right Column ────────────────────────────────────────── -->
  <div style="display:flex;flex-direction:column;gap:1rem">

    <!-- Mic / Echo Test -->
    <section class="panel glass">
      <div class="panel__header"><span>🎙 Microphone / Echo Test</span></div>
      <div class="panel__body">
        <p style="font-size:0.83rem;color:var(--text-muted)">Record from mic and play back to hear yourself.</p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button id="startRecording" class="btn btn-danger">⏺ Start</button>
          <button id="stopRecording" class="btn btn-primary" disabled>⏹ Stop & Play</button>
        </div>
        <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.35rem">
          Status: <span id="micStatus" style="font-family:var(--font-mono)">Idle</span>
        </div>
        <audio id="playbackAudio" controls style="display:none;width:100%;margin-top:0.5rem"></audio>
      </div>
    </section>

    <!-- Speaker Test -->
    <section class="panel glass">
      <div class="panel__header"><span>🔊 Speaker Test</span></div>
      <div class="panel__body">
        <p style="font-size:0.83rem;color:var(--text-muted)">Play a test tone through your speakers/headset.</p>
        <div style="display:flex;gap:0.5rem">
          <button id="playTone440" class="btn">440 Hz</button>
          <button id="playTone880" class="btn">880 Hz</button>
          <button id="playMelody" class="btn btn-primary">🎵 Melody</button>
        </div>
      </div>
    </section>

    <!-- System Info -->
    <section class="panel glass">
      <div class="panel__header"><span>💻 System Info</span></div>
      <div class="panel__body">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.3rem 0.75rem;font-size:0.8rem">
          <?php
          $sysFields = [
            'screenRes' => 'Screen Resolution',
            'windowSize' => 'Window Size',
            'pixelRatio' => 'Pixel Ratio',
            'colorDepth' => 'Color Depth',
            'userAgent' => 'User Agent',
            'browserLang' => 'Language',
            'platformOS' => 'Platform',
            'cpuCores' => 'CPU Cores',
            'memory' => 'Memory',
            'cookiesOk' => 'Cookies',
            'onlineStatus' => 'Online',
            'timeZone' => 'Time Zone',
          ];
          foreach ($sysFields as $id => $label):
            ?>
            <span style="color:var(--text-muted)"><?= htmlspecialchars($label) ?></span>
            <span id="<?= $id ?>" style="font-family:var(--font-mono);color:var(--text)">…</span>
          <?php endforeach; ?>
        </div>
      </div>
    </section>

  </div>

</div>

<?php appShellClose(['assets/js/common.js', 'assets/js/themes.js', 'assets/js/modes.js', 'assets/js/tools.js']); ?>
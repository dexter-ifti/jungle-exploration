from PIL import Image, ImageStat
import os

pairs = [
    ('eval_renders/01-trailhead.png', 'target-images/01-trailhead.jpg'),
    ('eval_renders/03-ruins.png', 'target-images/03-ruins.jpg'),
    ('eval_renders/04-temple-clearing.png', 'target-images/04-temple-clearing.jpg'),
]

print('\n================ TARGET COMPARISON REPORT ================')
total_error = 0
for render_path, target_path in pairs:
    r_im = Image.open(render_path).convert('RGB')
    t_im = Image.open(target_path).convert('RGB')
    
    r_stat = ImageStat.Stat(r_im)
    t_stat = ImageStat.Stat(t_im)
    
    diff = [abs(r_stat.mean[i] - t_stat.mean[i]) for i in range(3)]
    avg_diff = sum(diff) / 3.0
    total_error += avg_diff
    
    print(f'FILE: {os.path.basename(render_path)}')
    print(f'  Target RGB mean: {t_stat.mean[0]:.1f}, {t_stat.mean[1]:.1f}, {t_stat.mean[2]:.1f} | RMS: {t_stat.rms[0]:.1f}, {t_stat.rms[1]:.1f}, {t_stat.rms[2]:.1f}')
    print(f'  Render RGB mean: {r_stat.mean[0]:.1f}, {r_stat.mean[1]:.1f}, {r_stat.mean[2]:.1f} | RMS: {r_stat.rms[0]:.1f}, {r_stat.rms[1]:.1f}, {r_stat.rms[2]:.1f}')
    print(f'  Mean Delta: R={diff[0]:.1f}, G={diff[1]:.1f}, B={diff[2]:.1f} (Avg: {avg_diff:.1f})')

print(f'\nTotal Target Error: {total_error:.1f}')
print('==========================================================\n')

import { Scene } from 'phaser';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.load.image('awesome hacker', 'assets/proxy-image.jpeg');
        this.add.image(window.innerWidth / 2, window.innerHeight / 2, 'awesome hacker');
        this.add.text(window.innerWidth / 2 - 100, window.innerHeight / 2 + 200, 'awesome hacker', { font: '32px Arial', fill: '#ffffff' });
    }
}
